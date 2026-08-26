-- ============================================================
-- Внешний входящий должен реально сохраняться и быть виден менеджеру
-- Файл: supabase/migrations/014_create_incoming_external_contact.sql
--
-- Почему это нужно:
-- Менеджер не может INSERT контакт с mailing_id = NULL, пока колонка
-- обязательная, а политика INSERT как раз требует mailing_id IS NULL.
-- Тогда CRM пишет «обработка завершена», а строки в базе нет.
--
-- Что делает:
-- 1) mailing_id может быть пустым.
-- 2) Колонки is_external / source, если их ещё нет.
-- 3) is_manager_crm_user() для INSERT без чтения profiles.
-- 4) RPC create_incoming_external_contact — запись под auth.uid().
-- ============================================================

alter table public.mailing_contacts
alter column mailing_id drop not null;

alter table public.mailing_contacts
add column if not exists is_external boolean not null default false;

alter table public.mailing_contacts
add column if not exists source text;

create or replace function public.is_manager_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and lower(trim(profiles.role)) = 'manager'
      and lower(trim(coalesce(profiles.status, 'active'))) <> 'blocked'
  );
$$;

revoke all on function public.is_manager_crm_user() from public;
grant execute on function public.is_manager_crm_user() to authenticated;

drop policy if exists "Managers can create own external contacts"
on public.mailing_contacts;

create policy "Managers can create own external contacts"
on public.mailing_contacts
for insert
to authenticated
with check (
  manager_id = auth.uid()
  and coalesce(is_external, false) = true
  and mailing_id is null
  and public.is_manager_crm_user()
);

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
  v_id uuid;
  v_telegram text;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_manager_crm_user() then
    raise exception 'only manager can create incoming contacts';
  end if;

  v_telegram := public.normalize_telegram_username(p_telegram);

  if v_telegram is not null then
    v_telegram := '@' || v_telegram;
  end if;

  v_phone := public.normalize_phone_digits(p_phone);

  if v_telegram is null and v_phone is null then
    raise exception 'telegram or phone required';
  end if;

  select mc.id
  into v_id
  from public.mailing_contacts as mc
  where mc.manager_id = auth.uid()
    and (
      (
        v_telegram is not null
        and public.normalize_telegram_username(mc.telegram_username)
          = public.normalize_telegram_username(v_telegram)
      )
      or (
        v_phone is not null
        and public.normalize_phone_digits(mc.phone) = v_phone
      )
    )
  order by mc.created_at desc
  limit 1;

  if v_id is not null then
    update public.mailing_contacts
    set
      responded_at = coalesce(responded_at, p_responded_at),
      status = case
        when status = 'application' then status
        else 'responded'
      end,
      updated_at = now()
    where id = v_id
      and manager_id = auth.uid();

    return v_id;
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
    coalesce(v_telegram, v_phone, 'Новый входящий'),
    v_phone,
    v_telegram,
    auth.uid(),
    'responded',
    'external',
    true,
    p_responded_at,
    'Входящий контакт вне рассылки'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_incoming_external_contact(text, text, timestamptz) from public;
grant execute on function public.create_incoming_external_contact(text, text, timestamptz) to authenticated;
