-- ============================================================
-- Аналитика по периодам: incoming + заявки
-- Файл: supabase/migrations/009_period_analytics.sql
--
-- Что меняет:
-- 1) applications.rejected_at — дата первого перехода в отказ.
--    Нужна, чтобы считать отказы за период по событию, а не
--    по дате создания заявки.
-- 2) Руководитель (head) видит все mailing_contacts, как admin.
--    Иначе раздел «Входящий поток» и аналитика по команде
--    недоступны на уровне RLS.
-- 3) RPC-агрегации get_crm_period_stats,
--    get_crm_manager_analytics, sum_opened_amount.
--    Функции SECURITY INVOKER: менеджер видит только свои
--    строки по RLS, head/admin — все доступные.
-- 4) Триггер фиксирует rejected_at при первой смене
--    статуса на rejected.
--
-- Что НЕ меняет:
-- статусы заявок, зарплату, opened_at, approved_at.
-- ============================================================

alter table public.applications
add column if not exists rejected_at timestamptz;

comment on column public.applications.rejected_at is
  'Дата и время первого перехода заявки в статус отказ. Фиксируется один раз.';

-- История статусов, если таблица есть: берём ПЕРВЫЙ переход в rejected
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'application_history'
  ) then
    update public.applications as a
    set rejected_at = h.first_rejected_at
    from (
      select
        application_id,
        min(created_at) as first_rejected_at
      from public.application_history
      where field_name = 'status'
        and new_value = 'rejected'
      group by application_id
    ) as h
    where a.id = h.application_id
      and a.rejected_at is null;
  end if;
end
$$;

-- Заявки, которые сейчас в отказе, но истории не было:
-- приблизительная дата по updated_at, лучше чем ничего.
update public.applications
set rejected_at = updated_at
where rejected_at is null
  and status = 'rejected'
  and updated_at is not null;

create or replace function public.set_application_rejected_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'rejected'
    and (old.status is distinct from 'rejected')
    and new.rejected_at is null then
    new.rejected_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_application_rejected_at_trigger
on public.applications;

create trigger set_application_rejected_at_trigger
before update of status on public.applications
for each row
execute function public.set_application_rejected_at();

-- Руководитель видит все входящие контакты
drop policy if exists "Heads can view all mailing contacts"
on public.mailing_contacts;

create policy "Heads can view all mailing contacts"
on public.mailing_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'head'
  )
);

create or replace function public.get_crm_period_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'responded', (
      select count(*)::bigint
      from public.mailing_contacts as mc
      where mc.responded_at is not null
        and (p_from is null or mc.responded_at >= p_from)
        and (p_to is null or mc.responded_at < p_to)
        and (p_manager_id is null or mc.manager_id = p_manager_id)
    ),
    'applications', (
      select count(*)::bigint
      from public.applications as a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
    ),
    'opened', (
      select count(*)::bigint
      from public.applications as a
      where coalesce(a.opened_at, a.approved_at) is not null
        and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
        and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a
      where a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
    ),
    'managers', (
      select count(distinct mc.manager_id)::bigint
      from public.mailing_contacts as mc
      where mc.responded_at is not null
        and mc.manager_id is not null
        and (p_from is null or mc.responded_at >= p_from)
        and (p_to is null or mc.responded_at < p_to)
        and (p_manager_id is null or mc.manager_id = p_manager_id)
    ),
    'external', (
      select count(*)::bigint
      from public.mailing_contacts as mc
      where mc.responded_at is not null
        and (
          mc.is_external is true
          or mc.source = 'external'
          or mc.mailing_id is null
        )
        and (p_from is null or mc.responded_at >= p_from)
        and (p_to is null or mc.responded_at < p_to)
        and (p_manager_id is null or mc.manager_id = p_manager_id)
    )
  );
$$;

create or replace function public.get_crm_manager_analytics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
)
returns table (
  manager_id uuid,
  responded bigint,
  applications bigint,
  opened bigint,
  rejected bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id as manager_id,
    (
      select count(*)::bigint
      from public.mailing_contacts as mc
      where mc.manager_id = p.id
        and mc.responded_at is not null
        and (p_from is null or mc.responded_at >= p_from)
        and (p_to is null or mc.responded_at < p_to)
    ) as responded,
    (
      select count(*)::bigint
      from public.applications as a
      where a.assigned_manager_id = p.id
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
    ) as applications,
    (
      select count(*)::bigint
      from public.applications as a
      where a.assigned_manager_id = p.id
        and coalesce(a.opened_at, a.approved_at) is not null
        and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
        and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
    ) as opened,
    (
      select count(*)::bigint
      from public.applications as a
      where a.assigned_manager_id = p.id
        and a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
    ) as rejected
  from public.profiles as p
  where p.role in ('manager', 'head')
    and (p_manager_id is null or p.id = p_manager_id);
$$;

create or replace function public.sum_opened_amount(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(a.amount), 0)
  from public.applications as a
  where coalesce(a.opened_at, a.approved_at) is not null
    and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
    and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
    and (p_manager_id is null or a.assigned_manager_id = p_manager_id);
$$;

grant execute on function public.get_crm_period_stats(timestamptz, timestamptz, uuid)
to authenticated;

grant execute on function public.get_crm_manager_analytics(timestamptz, timestamptz, uuid)
to authenticated;

grant execute on function public.sum_opened_amount(timestamptz, timestamptz, uuid)
to authenticated;
