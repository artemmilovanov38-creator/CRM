-- ============================================================
-- Защита от дублей контактов и заявок
-- Файл: supabase/migrations/006_contact_and_application_uniqueness.sql
--
-- Зачем:
-- 1) Один менеджер не должен повторно занести тот же Telegram/телефон
--    как внешний входящий контакт.
-- 2) У одного контакта может быть несколько заявок, но только одна
--    заявка на каждый продукт.
-- 3) Менеджер не должен читать и менять чужие заявки через прямой запрос.
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
              trim(coalesce(value, '')),
              '^https?://',
              '',
              'i'
            ),
            '^t\.me/',
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

create or replace function public.normalize_phone_digits(value text)
returns text
language sql
immutable
as $$
  select case
    when digits = '' then null
    when length(digits) = 11 and left(digits, 1) = '8'
      then '7' || substring(digits from 2)
    when length(digits) = 10
      then '7' || digits
    else digits
  end
  from (
    select regexp_replace(coalesce(value, ''), '\D', '', 'g') as digits
  ) normalized;
$$;

grant execute on function public.normalize_telegram_username(text) to authenticated;
grant execute on function public.normalize_phone_digits(text) to authenticated;

create or replace function public.is_privileged_crm_user()
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
      and profiles.role in ('admin', 'head')
  );
$$;

revoke all on function public.is_privileged_crm_user() from public;
grant execute on function public.is_privileged_crm_user() to authenticated;

-- Внешний Telegram одного менеджера не должен дублироваться.
do $$
begin
  if exists (
    select 1
    from public.mailing_contacts
    where is_external = true
      and mailing_id is null
      and manager_id is not null
      and public.normalize_telegram_username(telegram_username) is not null
    group by
      manager_id,
      public.normalize_telegram_username(telegram_username)
    having count(*) > 1
  ) then
    raise notice 'Пропущен индекс mailing_contacts_external_telegram_per_manager_idx: есть дубли Telegram';
  else
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
  end if;
end
$$;

-- Внешний телефон одного менеджера не должен дублироваться.
do $$
begin
  if exists (
    select 1
    from public.mailing_contacts
    where is_external = true
      and mailing_id is null
      and manager_id is not null
      and public.normalize_phone_digits(phone) is not null
    group by
      manager_id,
      public.normalize_phone_digits(phone)
    having count(*) > 1
  ) then
    raise notice 'Пропущен индекс mailing_contacts_external_phone_per_manager_idx: есть дубли телефонов';
  else
    execute $sql$
      create unique index if not exists mailing_contacts_external_phone_per_manager_idx
      on public.mailing_contacts (
        manager_id,
        public.normalize_phone_digits(phone)
      )
      where is_external = true
        and mailing_id is null
        and manager_id is not null
        and public.normalize_phone_digits(phone) is not null
    $sql$;
  end if;
end
$$;

-- Один контакт + один продукт = одна заявка.
do $$
begin
  if to_regclass('public.applications') is null then
    raise notice 'Таблица applications не найдена, unique index не создан';
  elsif exists (
    select 1
    from public.applications
    where mailing_contact_id is not null
      and product_id is not null
    group by mailing_contact_id, product_id
    having count(*) > 1
  ) then
    raise notice 'Пропущен индекс applications_contact_product_unique_idx: есть дубли заявок';
  else
    execute $sql$
      create unique index if not exists applications_contact_product_unique_idx
      on public.applications (mailing_contact_id, product_id)
      where mailing_contact_id is not null
        and product_id is not null
    $sql$;
  end if;
end
$$;

-- Менеджер может создавать свои внешние контакты.
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
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'manager'
  )
);

-- Менеджер может удалять свои внешние контакты без заявок.
drop policy if exists "Managers can delete own external contacts"
on public.mailing_contacts;

create policy "Managers can delete own external contacts"
on public.mailing_contacts
for delete
to authenticated
using (
  manager_id = auth.uid()
  and coalesce(is_external, false) = true
  and mailing_id is null
);

-- Права на заявки: manager видит и меняет только свои.
do $$
begin
  if to_regclass('public.applications') is null then
    raise notice 'Таблица applications не найдена, RLS не применён';
    return;
  end if;

  execute 'alter table public.applications enable row level security';

  execute 'drop policy if exists "applications_select_own_or_privileged" on public.applications';
  execute 'drop policy if exists "applications_insert_own_or_privileged" on public.applications';
  execute 'drop policy if exists "applications_update_own_or_privileged" on public.applications';
  execute 'drop policy if exists "applications_delete_own_or_privileged" on public.applications';

  execute $sql$
    create policy "applications_select_own_or_privileged"
    on public.applications
    for select
    to authenticated
    using (
      public.is_privileged_crm_user()
      or assigned_manager_id = auth.uid()
    )
  $sql$;

  execute $sql$
    create policy "applications_insert_own_or_privileged"
    on public.applications
    for insert
    to authenticated
    with check (
      public.is_privileged_crm_user()
      or assigned_manager_id = auth.uid()
    )
  $sql$;

  execute $sql$
    create policy "applications_update_own_or_privileged"
    on public.applications
    for update
    to authenticated
    using (
      public.is_privileged_crm_user()
      or assigned_manager_id = auth.uid()
    )
    with check (
      public.is_privileged_crm_user()
      or assigned_manager_id = auth.uid()
    )
  $sql$;

  execute $sql$
    create policy "applications_delete_own_or_privileged"
    on public.applications
    for delete
    to authenticated
    using (
      public.is_privileged_crm_user()
      or assigned_manager_id = auth.uid()
    )
  $sql$;
end
$$;
