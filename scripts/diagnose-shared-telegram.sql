-- Диагностика трёх Telegram-ников.
-- Только чтение: контакты, менеджеры, рассылки, заявки и продукты.
-- Ник сравнивается без @ и без учёта регистра.

with targets(raw_username) as (
  values
    ('qqwweeeeeeeee'),
    ('timoshenkoarina'),
    ('titovaes')
),
contacts as (
  select
    targets.raw_username,
    mc.id as contact_id,
    mc.full_name,
    mc.telegram_username,
    mc.phone,
    mc.manager_id,
    manager.full_name as manager_name,
    manager.role as manager_role,
    mc.mailing_id,
    mailing.name as mailing_name,
    mc.source,
    mc.is_external,
    mc.status as contact_status,
    mc.responded_at,
    mc.created_at
  from targets
  left join public.mailing_contacts as mc
    on public.extract_telegram_username(mc.telegram_username) = targets.raw_username
    or public.extract_telegram_username(mc.full_name) = targets.raw_username
    or public.contact_matches_telegram(
      mc.telegram_username,
      mc.full_name,
      mc.raw_data,
      mc.comment,
      targets.raw_username
    )
  left join public.profiles as manager
    on manager.id = mc.manager_id
  left join public.mailings as mailing
    on mailing.id = mc.mailing_id
)
select
  contacts.raw_username,
  contacts.contact_id,
  contacts.full_name,
  contacts.telegram_username,
  contacts.manager_name,
  contacts.manager_role,
  contacts.mailing_name,
  contacts.source,
  contacts.is_external,
  contacts.contact_status,
  contacts.responded_at,
  app.id as application_id,
  app.product,
  product.name as product_name,
  app.status as application_status,
  app.amount,
  app.opening_price_snapshot,
  app.opened_at,
  app.approved_at,
  app.created_at as application_created_at,
  assignee.full_name as application_manager
from contacts
left join public.applications as app
  on app.mailing_contact_id = contacts.contact_id
left join public.products as product
  on product.id = app.product_id
left join public.profiles as assignee
  on assignee.id = app.assigned_manager_id
order by
  contacts.raw_username,
  contacts.created_at,
  app.created_at;
