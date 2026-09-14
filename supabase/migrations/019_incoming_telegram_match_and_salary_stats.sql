-- ============================================================
-- Нормализация Telegram + регистрация написавших + сверка зарплаты
-- Файл: supabase/migrations/019_incoming_telegram_match_and_salary_stats.sql
--
-- Что меняет:
-- 1) Единая нормализация Telegram: @user, user, t.me/user,
--    https://t.me/user, telegram.me, невидимые символы.
-- 2) Поиск написавшего по telegram_username, full_name и raw_data.
-- 3) RPC register_incoming_response отмечает существующий контакт
--    из рассылки, не создавая дубль. Unique-индекс не мешает
--    проставить responded_at.
-- 4) Безопасный backfill telegram_username, если ник лежит в ФИО
--    или сыром импорте как @user / t.me/user.
-- 5) Счётчик «Успешно открыты» считает только status = approved
--    по coalesce(opened_at, approved_at) — как зарплата.
--
-- Что НЕ меняет:
-- статусы заявок, RLS чтения чужих контактов, уникальность
-- контакт+продукт.
-- ============================================================

create or replace function public.normalize_telegram_username(value text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              trim(
                regexp_replace(
                  coalesce(value, ''),
                  E'[\u200b\u200c\u200d\ufeff\u00a0]',
                  '',
                  'g'
                )
              ),
              '^https?://(www\.)?',
              '',
              'i'
            ),
            '^(www\.)?(t(?:elegram)?\.me)/',
            '',
            'i'
          ),
          '^@+',
          ''
        ),
        '[/?#].*$',
        ''
      )
    ),
    ''
  );
$$;

create or replace function public.extract_telegram_username(value text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  direct text;
  extracted text;
begin
  cleaned := trim(
    regexp_replace(
      coalesce(value, ''),
      E'[\u200b\u200c\u200d\ufeff\u00a0]',
      '',
      'g'
    )
  );

  if cleaned is null or cleaned = '' then
    return null;
  end if;

  direct := public.normalize_telegram_username(cleaned);

  if direct ~ '^[a-z0-9_]{5,32}$' then
    return direct;
  end if;

  extracted := lower(
    (regexp_match(cleaned, '@([A-Za-z0-9_]{5,32})'))[1]
  );

  if extracted is not null then
    return extracted;
  end if;

  extracted := lower(
    (
      regexp_match(
        cleaned,
        't(?:elegram)?\.me/([A-Za-z0-9_]{5,32})',
        'i'
      )
    )[1]
  );

  return extracted;
end;
$$;

grant execute on function public.extract_telegram_username(text)
to authenticated;

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
      or public.extract_telegram_username(p_comment) = p_telegram_key
      or public.extract_telegram_username(p_raw::text) = p_telegram_key
      or (
        jsonb_typeof(coalesce(p_raw, '{}'::jsonb)) = 'object'
        and exists (
          select 1
          from jsonb_each_text(coalesce(p_raw, '{}'::jsonb)) as kv
          where public.extract_telegram_username(kv.value) = p_telegram_key
        )
      )
    );
$$;

create or replace function public.find_incoming_contact_ids(
  p_telegram text default null,
  p_phone text default null
)
returns table (id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with keys as (
    select
      public.extract_telegram_username(p_telegram) as telegram_key,
      public.normalize_phone_digits(p_phone) as phone_key
  )
  select mc.id
  from public.mailing_contacts as mc
  cross join keys
  where
    (
      keys.telegram_key is not null
      and public.contact_matches_telegram(
        mc.telegram_username,
        mc.full_name,
        mc.raw_data,
        mc.comment,
        keys.telegram_key
      )
    )
    or
    (
      keys.phone_key is not null
      and public.normalize_phone_digits(mc.phone) = keys.phone_key
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
  v_status text;
  v_found_in_mailing boolean := false;
  v_created_external boolean := false;
  v_already_responded boolean := false;
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
    mc.responded_at,
    mc.status
  into
    v_id,
    v_mailing_id,
    v_manager_id,
    v_responded_at,
    v_status
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
    case when mc.responded_at is null then 0 else 1 end,
    mc.created_at asc
  limit 1;

  if v_id is not null
    and v_manager_id is not null
    and v_manager_id <> v_uid then
    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_mailing_id is not null,
      'created_external', false,
      'already_responded', v_responded_at is not null,
      'conflict', true
    );
  end if;

  if v_id is not null then
    v_found_in_mailing := v_mailing_id is not null;
    v_already_responded := v_responded_at is not null;

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
      phone = coalesce(nullif(phone, ''), v_phone),
      updated_at = timezone('utc', now())
    where id = v_id
      and (
        manager_id = v_uid
        or manager_id is null
      );

    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_found_in_mailing,
      'created_external', false,
      'already_responded', v_already_responded,
      'conflict', false
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
    'conflict', false
  );
exception
  when unique_violation then
    select mc.id, mc.mailing_id, mc.responded_at
    into v_id, v_mailing_id, v_responded_at
    from public.mailing_contacts as mc
    where mc.manager_id = v_uid
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
    order by mc.created_at desc
    limit 1;

    if v_id is null then
      raise;
    end if;

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
      updated_at = timezone('utc', now())
    where id = v_id
      and manager_id = v_uid;

    return jsonb_build_object(
      'id', v_id,
      'found_in_mailing', v_mailing_id is not null,
      'created_external', false,
      'already_responded', v_already_responded,
      'conflict', false
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

  if coalesce((result->>'conflict')::boolean, false) then
    return (result->>'id')::uuid;
  end if;

  return (result->>'id')::uuid;
end;
$$;

-- Ник из ФИО/ссылки, только явные Telegram-формы. Имена вроде «Andrey»
-- не превращаем в username автоматически.
update public.mailing_contacts as mc
set
  telegram_username = '@' || coalesce(
    public.format_telegram_username_display(mc.full_name),
    public.extract_telegram_username(mc.full_name)
  ),
  updated_at = timezone('utc', now())
where public.extract_telegram_username(mc.telegram_username) is null
  and (
    mc.full_name ~ '@[A-Za-z0-9_]{5,32}'
    or mc.full_name ~* 't(?:elegram)?\.me/[A-Za-z0-9_]{5,32}'
  );

update public.mailing_contacts as mc
set
  telegram_username = '@' || sub.username,
  updated_at = timezone('utc', now())
from (
  select
    source.id,
    public.extract_telegram_username(kv.value) as username
  from public.mailing_contacts as source
  cross join lateral jsonb_each_text(source.raw_data) as kv
  where jsonb_typeof(source.raw_data) = 'object'
    and public.extract_telegram_username(source.telegram_username) is null
    and lower(kv.key) in (
      'telegram',
      'telegram_username',
      'username',
      'ник',
      'телеграм',
      'tg'
    )
    and public.extract_telegram_username(kv.value) is not null
) as sub
where mc.id = sub.id;

create or replace function public.get_application_period_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null,
  p_product_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with scope as (
    select public.effective_crm_manager_id(p_manager_id) as manager_id
  )
  select jsonb_build_object(
    'total', (
      select count(*)::bigint
      from public.applications as a, scope
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'new_applications', (
      select count(*)::bigint
      from public.applications as a, scope
      where a.status in ('new', 'waiting')
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'in_progress', (
      select count(*)::bigint
      from public.applications as a, scope
      where a.in_progress_at is not null
        and (p_from is null or a.in_progress_at >= p_from)
        and (p_to is null or a.in_progress_at < p_to)
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'opened', (
      select count(*)::bigint
      from public.applications as a, scope
      where a.status = 'approved'
        and coalesce(a.opened_at, a.approved_at) is not null
        and (
          p_from is null
          or coalesce(a.opened_at, a.approved_at) >= p_from
        )
        and (
          p_to is null
          or coalesce(a.opened_at, a.approved_at) < p_to
        )
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a, scope
      where a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'total_amount', (
      select coalesce(
        sum(
          coalesce(
            a.amount,
            a.opening_price_snapshot,
            0
          )
        ),
        0
      )
      from public.applications as a, scope
      where a.status = 'approved'
        and coalesce(a.opened_at, a.approved_at) is not null
        and (
          p_from is null
          or coalesce(a.opened_at, a.approved_at) >= p_from
        )
        and (
          p_to is null
          or coalesce(a.opened_at, a.approved_at) < p_to
        )
        and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    )
  );
$$;

grant execute on function public.get_application_period_stats(
  timestamptz,
  timestamptz,
  uuid,
  uuid
) to authenticated;
