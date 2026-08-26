-- ============================================================
-- Заявки: владелец assigned_manager_id, устойчивая загрузка
-- Файл: supabase/migrations/013_application_owner_and_safe_reads.sql
--
-- Что меняет:
-- 1) Владелец заявки — applications.assigned_manager_id.
--    Старые строки без него заполняются из manager_id / created_by,
--    если такие колонки есть.
-- 2) RLS заявок через is_privileged_crm_user(): head/admin видят все,
--    менеджер — только свои. SELECT своего профиля не требуется.
-- 3) Менеджер может прочитать mailing_contact, на который уже есть
--    его заявка. Иначе вложенный/связанный контакт даёт ошибку
--    только у тех, у кого контакт отвязан или manager_id пустой.
--
-- Что НЕ меняет:
-- статусы, продукты, несколько заявок на контакт.
-- ============================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applications'
      and column_name = 'manager_id'
  ) then
    execute $sql$
      update public.applications
      set assigned_manager_id = manager_id
      where assigned_manager_id is null
        and manager_id is not null
    $sql$;
  end if;
end
$$;

update public.applications
set assigned_manager_id = created_by
where assigned_manager_id is null
  and created_by is not null;

create index if not exists applications_assigned_manager_created_idx
on public.applications (assigned_manager_id, created_at desc);

create index if not exists applications_mailing_contact_id_idx
on public.applications (mailing_contact_id)
where mailing_contact_id is not null;

drop policy if exists "applications_select_own_or_privileged"
on public.applications;

drop policy if exists "applications_insert_own_or_privileged"
on public.applications;

drop policy if exists "applications_update_own_or_privileged"
on public.applications;

drop policy if exists "applications_delete_own_or_privileged"
on public.applications;

create policy "applications_select_own_or_privileged"
on public.applications
for select
to authenticated
using (
  public.is_privileged_crm_user()
  or assigned_manager_id = auth.uid()
);

create policy "applications_insert_own_or_privileged"
on public.applications
for insert
to authenticated
with check (
  public.is_privileged_crm_user()
  or assigned_manager_id = auth.uid()
);

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
);

create policy "applications_delete_own_or_privileged"
on public.applications
for delete
to authenticated
using (
  public.is_privileged_crm_user()
  or assigned_manager_id = auth.uid()
);

drop policy if exists "Managers can view contacts of own applications"
on public.mailing_contacts;

create policy "Managers can view contacts of own applications"
on public.mailing_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.applications as a
    where a.mailing_contact_id = mailing_contacts.id
      and a.assigned_manager_id = auth.uid()
  )
);
