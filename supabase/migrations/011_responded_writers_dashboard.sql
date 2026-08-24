-- ============================================================
-- Дашборд «Все написавшие»
-- Файл: supabase/migrations/011_responded_writers_dashboard.sql
--
-- Что меняет:
-- 1) Индексы по responded_at и mailing_contact_id,
--    чтобы фильтры и пагинация работали на десятках тысяч строк.
-- 2) RPC get_responded_writers_stats: сводка по тем контактам,
--    которые написали в выбранный период (responded_at),
--    с фильтром по менеджеру и рассылке.
--
-- SECURITY INVOKER: менеджер видит только свои строки по RLS,
-- head/admin — все доступные. Подмена manager_id на фронте
-- не даёт чужие данные.
-- ============================================================

create index if not exists mailing_contacts_responded_at_idx
on public.mailing_contacts (responded_at desc)
where responded_at is not null;

create index if not exists mailing_contacts_responded_manager_idx
on public.mailing_contacts (manager_id, responded_at desc)
where responded_at is not null;

create index if not exists mailing_contacts_responded_mailing_idx
on public.mailing_contacts (mailing_id, responded_at desc)
where responded_at is not null;

create index if not exists applications_mailing_contact_id_idx
on public.applications (mailing_contact_id);

create or replace function public.get_responded_writers_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null,
  p_mailing_id uuid default null,
  p_external_only boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with writers as (
    select
      mc.id,
      mc.manager_id
    from public.mailing_contacts as mc
    where mc.responded_at is not null
      and (p_from is null or mc.responded_at >= p_from)
      and (p_to is null or mc.responded_at < p_to)
      and (p_manager_id is null or mc.manager_id = p_manager_id)
      and (
        case
          when coalesce(p_external_only, false) then (
            mc.is_external is true
            or mc.mailing_id is null
          )
          when p_mailing_id is not null then mc.mailing_id = p_mailing_id
          else true
        end
      )
  )
  select jsonb_build_object(
    'responded', (
      select count(*)::bigint
      from writers
    ),
    'applications', (
      select count(*)::bigint
      from public.applications as a
      inner join writers as w
        on w.id = a.mailing_contact_id
    ),
    'opened', (
      select count(*)::bigint
      from public.applications as a
      inner join writers as w
        on w.id = a.mailing_contact_id
      where a.status = 'approved'
        or coalesce(a.opened_at, a.approved_at) is not null
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a
      inner join writers as w
        on w.id = a.mailing_contact_id
      where a.status = 'rejected'
        or a.rejected_at is not null
    ),
    'managers', (
      select count(distinct w.manager_id)::bigint
      from writers as w
      where w.manager_id is not null
    )
  );
$$;

grant execute on function public.get_responded_writers_stats(
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  boolean
) to authenticated;
