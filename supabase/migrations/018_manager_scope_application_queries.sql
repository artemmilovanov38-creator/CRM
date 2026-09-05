-- ============================================================
-- Менеджер не может запросить чужие заявки через p_manager_id
-- Файл: supabase/migrations/018_manager_scope_application_queries.sql
--
-- Что меняет:
-- 1) effective_crm_manager_id() для head/admin оставляет
--    переданный p_manager_id (включая null = все).
--    Для manager всегда возвращает auth.uid().
-- 2) RPC статистики заявок используют эту функцию,
--    поэтому подмена manager_id в запросе не открывает
--    чужие заявки даже до RLS.
--
-- Что НЕ меняет:
-- статусы, продукты, RLS-политики applications
-- (менеджер по-прежнему видит только assigned_manager_id = auth.uid()).
-- ============================================================

create or replace function public.effective_crm_manager_id(
  p_manager_id uuid default null
)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when public.is_privileged_crm_user() then p_manager_id
    else auth.uid()
  end;
$$;

revoke all on function public.effective_crm_manager_id(uuid) from public;
grant execute on function public.effective_crm_manager_id(uuid) to authenticated;

drop function if exists public.get_application_period_stats(timestamptz, timestamptz, uuid);
drop function if exists public.get_application_period_stats(timestamptz, timestamptz, uuid, uuid);

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
      where (p_from is null or a.created_at >= p_from)
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
      where coalesce(a.opened_at, a.approved_at) is not null
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

grant execute on function public.get_application_period_stats(timestamptz, timestamptz, uuid, uuid)
to authenticated;

drop function if exists public.sum_opened_amount(timestamptz, timestamptz, uuid);
drop function if exists public.sum_opened_amount(timestamptz, timestamptz, uuid, uuid);

create or replace function public.sum_opened_amount(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null,
  p_product_id uuid default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select public.effective_crm_manager_id(p_manager_id) as manager_id
  )
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
    and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
    and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
    and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
    and (p_product_id is null or a.product_id = p_product_id);
$$;

grant execute on function public.sum_opened_amount(timestamptz, timestamptz, uuid, uuid)
to authenticated;

drop function if exists public.get_application_manager_analytics(timestamptz, timestamptz, uuid, uuid);

create or replace function public.get_application_manager_analytics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null,
  p_product_id uuid default null
)
returns table (
  manager_id uuid,
  name text,
  applications bigint,
  in_progress bigint,
  opened bigint,
  rejected bigint,
  total_amount numeric
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with scope as (
    select public.effective_crm_manager_id(p_manager_id) as manager_id
  ),
  managers as (
    select
      p.id,
      coalesce(
        nullif(trim(p.full_name), ''),
        'Без имени'
      ) as name
    from public.profiles as p, scope
    where lower(trim(p.role)) in ('manager', 'head')
      and lower(trim(coalesce(p.status, 'active'))) <> 'blocked'
      and (scope.manager_id is null or p.id = scope.manager_id)
  ),
  created as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a, scope
    where a.assigned_manager_id is not null
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
      and (p_product_id is null or a.product_id = p_product_id)
    group by a.assigned_manager_id
  ),
  in_progress as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a, scope
    where a.assigned_manager_id is not null
      and a.in_progress_at is not null
      and (p_from is null or a.in_progress_at >= p_from)
      and (p_to is null or a.in_progress_at < p_to)
      and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
      and (p_product_id is null or a.product_id = p_product_id)
    group by a.assigned_manager_id
  ),
  opened as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt,
      coalesce(
        sum(
          coalesce(
            a.amount,
            a.opening_price_snapshot,
            0
          )
        ),
        0
      ) as amount
    from public.applications as a, scope
    where a.assigned_manager_id is not null
      and a.status = 'approved'
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
    group by a.assigned_manager_id
  ),
  rejected as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a, scope
    where a.assigned_manager_id is not null
      and a.rejected_at is not null
      and (p_from is null or a.rejected_at >= p_from)
      and (p_to is null or a.rejected_at < p_to)
      and (scope.manager_id is null or a.assigned_manager_id = scope.manager_id)
      and (p_product_id is null or a.product_id = p_product_id)
    group by a.assigned_manager_id
  )
  select
    m.id as manager_id,
    m.name,
    coalesce(c.cnt, 0) as applications,
    coalesce(i.cnt, 0) as in_progress,
    coalesce(o.cnt, 0) as opened,
    coalesce(j.cnt, 0) as rejected,
    coalesce(o.amount, 0) as total_amount
  from managers as m
  left join created as c on c.manager_id = m.id
  left join in_progress as i on i.manager_id = m.id
  left join opened as o on o.manager_id = m.id
  left join rejected as j on j.manager_id = m.id;
$$;

grant execute on function public.get_application_manager_analytics(timestamptz, timestamptz, uuid, uuid)
to authenticated;
