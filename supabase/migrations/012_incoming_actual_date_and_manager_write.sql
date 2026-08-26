-- ============================================================
-- Фактическая дата входящего и запись менеджера
-- Файл: supabase/migrations/012_incoming_actual_date_and_manager_write.sql
--
-- Что меняет:
-- 1) mailing_id может быть NULL — внешние входящие не из рассылки.
-- 2) Колонки is_external и source, если их ещё нет.
-- 3) responded_at — фактическая дата «когда написал», не created_at.
-- 4) is_manager_crm_user() SECURITY DEFINER: INSERT внешнего
--    контакта не зависит от того, может ли менеджер SELECT
--    свой профиль через RLS profiles.
-- 5) RPC поиска по нормализованному Telegram/телефону, чтобы
--    не выгружать все контакты менеджера на клиент.
--
-- Что НЕ меняет:
-- created_at остаётся техническим временем создания строки.
-- Повторное внесение не перезаписывает responded_at (логика
-- на клиенте). Защита RLS не отключается.
-- ============================================================

alter table public.mailing_contacts
alter column mailing_id drop not null;

alter table public.mailing_contacts
add column if not exists is_external boolean not null default false;

alter table public.mailing_contacts
add column if not exists source text;

comment on column public.mailing_contacts.responded_at is
  'Фактическая дата входящего: когда человек написал, а не когда строка создана в CRM.';

comment on column public.mailing_contacts.created_at is
  'Техническая дата создания записи в CRM. Не использовать как дату входящего.';

comment on column public.mailing_contacts.is_external is
  'Контакт вне рассылки: менеджер занёс написавшего, которого не было в партии.';

-- Счётчики рассылки не должны падать, если mailing_id пустой.
create or replace function public.sync_mailing_counters_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  affected_mailing_id uuid;
begin
  affected_mailing_id := coalesce(new.mailing_id, old.mailing_id);

  if affected_mailing_id is not null then
    perform public.refresh_mailing_counters(
      affected_mailing_id
    );
  end if;

  return coalesce(new, old);
end;
$$;

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

create index if not exists mailing_contacts_normalized_telegram_idx
on public.mailing_contacts (public.normalize_telegram_username(telegram_username))
where public.normalize_telegram_username(telegram_username) is not null;

create index if not exists mailing_contacts_normalized_phone_idx
on public.mailing_contacts (public.normalize_phone_digits(phone))
where public.normalize_phone_digits(phone) is not null;

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
  select mc.id
  from public.mailing_contacts as mc
  where
    (
      public.normalize_telegram_username(p_telegram) is not null
      and public.normalize_telegram_username(mc.telegram_username)
        = public.normalize_telegram_username(p_telegram)
    )
    or
    (
      public.normalize_phone_digits(p_phone) is not null
      and public.normalize_phone_digits(mc.phone)
        = public.normalize_phone_digits(p_phone)
    );
$$;

revoke all on function public.find_incoming_contact_ids(text, text) from public;
grant execute on function public.find_incoming_contact_ids(text, text) to authenticated;
