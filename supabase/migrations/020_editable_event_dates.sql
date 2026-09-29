-- ============================================================
-- Редактируемые даты заявки
-- Файл: supabase/migrations/020_editable_event_dates.sql
--
-- Руководитель (head) может править mailing_contacts,
-- чтобы вместе с менеджером поправить дату «когда написал».
-- ============================================================

drop policy if exists "Heads can update mailing contacts"
on public.mailing_contacts;

create policy "Heads can update mailing contacts"
on public.mailing_contacts
for update
to authenticated
using (public.is_privileged_crm_user())
with check (public.is_privileged_crm_user());
