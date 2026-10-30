-- ============================================================
-- Второй менеджер может занести уже существующий Telegram
-- Файл: supabase/migrations/023_manager_can_enter_existing_telegram.sql
--
-- Почему «не даёт занести»:
-- 1) register_incoming_response находил чужую строку и не создавал
--    карточку текущего менеджера.
-- 2) unique-индекс по Telegram на всю таблицу превращал повтор
--    в unique_violation, а обработчик искал только свои строки
--    и поднимал ошибку.
-- 3) «Мои контакты» читают только manager_id = я, поэтому чужая
--    строка в списке не появляется.
--
-- Что делает:
-- 1) Убирает уникальность Telegram на всю CRM. Один менеджер
--    по-прежнему не может занести тот же ник дважды.
-- 2) Регистрация сначала ищет СВОЮ строку. Если её нет —
--    создаёт внешний контакт этого менеджера, даже если ник
--    уже есть у коллеги.
-- 3) Если вставить нельзя, возвращает общий контакт, чтобы
--    по нему можно было открыть заявку.
-- ============================================================

do $$
declare
  rec record;
begin
  for rec in
    select i.relname as index_name
    from pg_index x
    join pg_class t on t.oid = x.indrelid
    join pg_class i on i.oid = x.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mailing_contacts'
      and x.indisunique
      and not x.indisprimary
      and pg_get_indexdef(i.oid) ilike '%telegram%'
      and pg_get_indexdef(i.oid) not ilike '%manager_id%'
  loop
    execute format('drop index if exists public.%I', rec.index_name);
  end loop;

  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mailing_contacts'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%telegram%'
      and pg_get_constraintdef(c.oid) not ilike '%manager_id%'
  loop
    execute format(
      'alter table public.mailing_contacts drop constraint if exists %I',
      rec.conname
    );
  end loop;
end
$$;

create or replace function public.shared_contact_payload(p_contact_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_privileged boolean := false;
  v_owned boolean := false;
  v_contact public.mailing_contacts%rowtype;
  v_products jsonb := '[]'::jsonb;
  v_mailing_name text := null;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_privileged := public.is_privileged_crm_user();

  if not v_privileged and not public.is_manager_crm_user() then
    raise exception 'not allowed';
  end if;

  select *
  into v_contact
  from public.mailing_contacts
  where id = p_contact_id;

  if not found then
    return null;
  end if;

  v_owned := v_contact.manager_id is not null
    and v_contact.manager_id = v_uid;

  if v_privileged or v_owned then
    select m.name
    into v_mailing_name
    from public.mailings as m
    where m.id = v_contact.mailing_id;
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_products
  from (
    select jsonb_build_object(
      'product_id', a.product_id,
      'product_name', coalesce(p.name, nullif(a.product, ''), 'Продукт'),
      'owned_by_me', a.assigned_manager_id = v_uid,
      'status', case
        when v_privileged or a.assigned_manager_id = v_uid then a.status
        else null
      end
    ) as item
    from public.applications as a
    left join public.products as p
      on p.id = a.product_id
    where a.mailing_contact_id = p_contact_id
    order by a.created_at desc
  ) as hints;

  return jsonb_build_object(
    'id', v_contact.id,
    'full_name', v_contact.full_name,
    'telegram_username', v_contact.telegram_username,
    'phone', v_contact.phone,
    'email', case
      when v_privileged or v_owned then v_contact.email
      else null
    end,
    'comment', case
      when v_privileged or v_owned then v_contact.comment
      else null
    end,
    'mailing_id', v_contact.mailing_id,
    'mailing_name', v_mailing_name,
    'status', v_contact.status,
    'responded_at', case
      when v_privileged or v_owned then v_contact.responded_at
      else null
    end,
    'manager_id', case
      when v_privileged or v_owned then v_contact.manager_id
      else null
    end,
    'owned_by_me', v_owned or v_contact.manager_id is null,
    'shared_existing', v_contact.manager_id is not null
      and v_contact.manager_id <> v_uid
      and not v_privileged,
    'products', v_products
  );
end;
$$;

revoke all on function public.shared_contact_payload(uuid) from public;
grant execute on function public.shared_contact_payload(uuid) to authenticated;

do $$
begin
  execute $sql$
    create unique index if not exists mailing_contacts_external_telegram_per_manager_idx
    on public.mailing_contacts (
      manager_id,
      public.normalize_telegram_username(telegram_username)
    )
    where is_external = true
      and mailing_id is null
      and manager_id is not null
      and public.normalize_telegram_username(telegram_username) is not null
  $sql$;
exception
  when others then
    raise notice 'Индекс mailing_contacts_external_telegram_per_manager_idx не создан: %', sqlerrm;
end
$$;

create or replace function public.contact_matches_telegram(
  p_username text,
  p_full_name text,
  p_raw jsonb,
  p_comment text,
  p_telegram_key text
)
returns boolean
language sql
immutable
as $$
  select
    p_telegram_key is not null
    and (
      public.extract_telegram_username(p_username) = p_telegram_key
      or public.extract_telegram_username(p_full_name) = p_telegram_key
      or (
        public.extract_telegram_username(p_username) is null
        and (
          public.extract_telegram_username(p_comment) = p_telegram_key
          or (
            jsonb_typeof(coalesce(p_raw, '{}'::jsonb)) = 'object'
            and exists (
              select 1
              from jsonb_each_text(coalesce(p_raw, '{}'::jsonb)) as kv
              where public.extract_telegram_username(kv.value) = p_telegram_key
            )
          )
        )
      )
    );
$$;

create or replace function public.register_incoming_response(
  p_telegram text default null,
  p_phone text default null,
  p_responded_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_telegram_key text;
  v_telegram_display text;
  v_phone text;
  v_id uuid;
  v_mailing_id uuid;
  v_manager_id uuid;
  v_responded_at timestamptz;
  v_found_in_mailing boolean := false;
  v_created_external boolean := false;
  v_already_responded boolean := false;
  v_shared boolean := false;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_manager_crm_user() then
    raise exception 'only manager can create incoming contacts';
  end if;

  v_telegram_key := public.extract_telegram_username(p_telegram);
  v_telegram_display := public.format_telegram_username_display(p_telegram);
  v_phone := public.normalize_phone_digits(p_phone);

  if v_telegram_key is null and v_phone is null then
    raise exception 'telegram or phone required';
  end if;

  if v_telegram_display is not null then
    v_telegram_display := '@' || v_telegram_display;
  elsif v_telegram_key is not null then
    v_telegram_display := '@' || v_telegram_key;
  end if;

  select
    mc.id,
    mc.mailing_id,
    mc.manager_id,
    mc.responded_at
  into
    v_id,
    v_mailing_id,
    v_manager_id,
    v_responded_at
  from public.mailing_contacts as mc
  where
    mc.manager_id = v_uid
    and (
      (
        v_telegram_key is not null
        and public.contact_matches_telegram(
          mc.telegram_username,
          mc.full_name,
          mc.raw_data,
          mc.comment,
          v_telegram_key
        )
      )
      or (
        v_phone is not null
        and public.normalize_phone_digits(mc.phone) = v_phone
      )
    )
  order by
    case when mc.mailing_id is not null then 0 else 1 end,
    case when mc.responded_at is null then 0 else 1 end,
    mc.created_at asc
  limit 1;

  if v_id is not null then
    v_found_in_mailing := v_mailing_id is not null;
    v_already_responded := v_responded_at is not null;

    update public.mailing_contacts
    set
      responded_at = coalesce(responded_at, p_responded_at),
      status = case
        when status = 'application' then status
        else 'responded'
      end,
      telegram_username = coalesce(
        nullif(telegram_username, ''),
        v_telegram_display
      ),
      phone = coalesce(nullif(phone, ''), v_phone),
      updated_at = timezone('utc', now())
    where id = v_id
      and manager_id = v_uid;

    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_found_in_mailing,
      'created_external', false,
      'already_responded', v_already_responded,
      'conflict', false,
      'shared_existing', false,
      'contact', public.shared_contact_payload(v_id)
    );
  end if;

  select
    mc.id,
    mc.mailing_id,
    mc.manager_id,
    mc.responded_at
  into
    v_id,
    v_mailing_id,
    v_manager_id,
    v_responded_at
  from public.mailing_contacts as mc
  where
    mc.manager_id is null
    and (
      (
        v_telegram_key is not null
        and public.contact_matches_telegram(
          mc.telegram_username,
          mc.full_name,
          mc.raw_data,
          mc.comment,
          v_telegram_key
        )
      )
      or (
        v_phone is not null
        and public.normalize_phone_digits(mc.phone) = v_phone
      )
    )
  order by
    case when mc.mailing_id is not null then 0 else 1 end,
    mc.created_at asc
  limit 1;

  if v_id is not null then
    update public.mailing_contacts
    set
      responded_at = coalesce(responded_at, p_responded_at),
      manager_id = v_uid,
      status = case
        when status = 'application' then status
        else 'responded'
      end,
      telegram_username = coalesce(
        nullif(telegram_username, ''),
        v_telegram_display
      ),
      phone = coalesce(nullif(phone, ''), v_phone),
      updated_at = timezone('utc', now())
    where id = v_id
      and manager_id is null;

    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_mailing_id is not null,
      'created_external', false,
      'already_responded', v_responded_at is not null,
      'conflict', false,
      'shared_existing', false,
      'contact', public.shared_contact_payload(v_id)
    );
  end if;

  insert into public.mailing_contacts (
    mailing_id,
    full_name,
    phone,
    telegram_username,
    manager_id,
    status,
    source,
    is_external,
    responded_at,
    comment
  ) values (
    null,
    coalesce(v_telegram_display, v_phone, 'Новый входящий'),
    v_phone,
    v_telegram_display,
    v_uid,
    'responded',
    'external',
    true,
    p_responded_at,
    'Входящий контакт вне рассылки'
  )
  returning id into v_id;

  v_created_external := true;

  return jsonb_build_object(
    'id', v_id,
    'found_in_mailing', false,
    'created_external', v_created_external,
    'already_responded', false,
    'conflict', false,
    'shared_existing', false,
    'contact', public.shared_contact_payload(v_id)
  );
exception
  when unique_violation then
    select
      mc.id,
      mc.mailing_id,
      mc.manager_id,
      mc.responded_at
    into
      v_id,
      v_mailing_id,
      v_manager_id,
      v_responded_at
    from public.mailing_contacts as mc
    where
      (
        v_telegram_key is not null
        and public.contact_matches_telegram(
          mc.telegram_username,
          mc.full_name,
          mc.raw_data,
          mc.comment,
          v_telegram_key
        )
      )
      or (
        v_phone is not null
        and public.normalize_phone_digits(mc.phone) = v_phone
      )
    order by
      case when mc.manager_id = v_uid then 0 else 1 end,
      mc.created_at desc
    limit 1;

    if v_id is not null
      and (v_manager_id is null or v_manager_id = v_uid) then
      v_already_responded := v_responded_at is not null;
      v_found_in_mailing := v_mailing_id is not null;

      update public.mailing_contacts
      set
        responded_at = coalesce(responded_at, p_responded_at),
        manager_id = coalesce(manager_id, v_uid),
        status = case
          when status = 'application' then status
          else 'responded'
        end,
        telegram_username = coalesce(
          nullif(telegram_username, ''),
          v_telegram_display
        ),
        updated_at = timezone('utc', now())
      where id = v_id
        and (manager_id = v_uid or manager_id is null);

      return jsonb_build_object(
        'id', v_id,
        'found_in_mailing', v_found_in_mailing,
        'created_external', false,
        'already_responded', v_already_responded,
        'conflict', false,
        'shared_existing', false,
        'contact', public.shared_contact_payload(v_id)
      );
    end if;

    v_shared := v_id is not null
      and v_manager_id is not null
      and v_manager_id <> v_uid;

    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_mailing_id is not null,
      'created_external', false,
      'already_responded', false,
      'conflict', false,
      'shared_existing', v_shared,
      'contact', public.shared_contact_payload(v_id)
    );
end;
$$;

revoke all on function public.register_incoming_response(text, text, timestamptz)
from public;
grant execute on function public.register_incoming_response(text, text, timestamptz)
to authenticated;

create or replace function public.create_incoming_external_contact(
  p_telegram text default null,
  p_phone text default null,
  p_responded_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  result := public.register_incoming_response(
    p_telegram,
    p_phone,
    p_responded_at
  );

  return (result->>'id')::uuid;
end;
$$;

create or replace function public.lookup_shared_contact(
  p_telegram text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_telegram_key text;
  v_phone text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_privileged_crm_user()
    and not public.is_manager_crm_user() then
    raise exception 'not allowed';
  end if;

  v_telegram_key := public.extract_telegram_username(p_telegram);
  v_phone := public.normalize_phone_digits(p_phone);

  if v_telegram_key is null and v_phone is null then
    return null;
  end if;

  select mc.id
  into v_id
  from public.mailing_contacts as mc
  where
    (
      v_telegram_key is not null
      and public.contact_matches_telegram(
        mc.telegram_username,
        mc.full_name,
        mc.raw_data,
        mc.comment,
        v_telegram_key
      )
    )
    or (
      v_phone is not null
      and public.normalize_phone_digits(mc.phone) = v_phone
    )
  order by
    case when mc.manager_id = v_uid then 0 else 1 end,
    case when mc.mailing_id is not null then 0 else 1 end,
    mc.created_at asc
  limit 1;

  if v_id is null then
    return null;
  end if;

  return public.shared_contact_payload(v_id);
end;
$$;

revoke all on function public.lookup_shared_contact(text, text) from public;
grant execute on function public.lookup_shared_contact(text, text) to authenticated;

create or replace function public.search_contacts_by_telegram(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_telegram_key text;
  v_phone text;
  v_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_privileged_crm_user()
    and not public.is_manager_crm_user() then
    raise exception 'not allowed';
  end if;

  v_telegram_key := public.extract_telegram_username(p_query);
  v_phone := public.normalize_phone_digits(p_query);

  if v_telegram_key is null and v_phone is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(payload), '[]'::jsonb)
  into v_items
  from (
    select public.shared_contact_payload(mc.id) as payload
    from public.mailing_contacts as mc
    where
      (
        v_telegram_key is not null
        and public.contact_matches_telegram(
          mc.telegram_username,
          mc.full_name,
          mc.raw_data,
          mc.comment,
          v_telegram_key
        )
      )
      or (
        v_phone is not null
        and public.normalize_phone_digits(mc.phone) = v_phone
      )
    order by
      case when mc.manager_id = v_uid then 0 else 1 end,
      mc.created_at desc
    limit 20
  ) as found
  where payload is not null
    and payload ? 'id';

  return coalesce(v_items, '[]'::jsonb);
end;
$$;

revoke all on function public.search_contacts_by_telegram(text) from public;
grant execute on function public.search_contacts_by_telegram(text) to authenticated;

revoke all on function public.create_incoming_external_contact(text, text, timestamptz)
from public;
grant execute on function public.create_incoming_external_contact(text, text, timestamptz)
to authenticated;
