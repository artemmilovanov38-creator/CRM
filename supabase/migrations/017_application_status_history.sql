-- ============================================================
-- История этапов заявки и аналитика по датам событий
-- Файл: supabase/migrations/017_application_status_history.sql
--
-- Что меняет:
-- 1) Гарантирует таблицу application_history (уже используется
--    в UI). Новую application_status_history НЕ создаём.
-- 2) Каждое изменение status пишет отдельную строку истории.
--    Старые события не удаляются и не перезаписываются.
-- 3) applications.in_progress_at — дата ПЕРВОГО перехода
--    во «В работе». Полей opened_at / rejected_at / created_at
--    не дублируем: они уже есть.
-- 4) Старым заявкам не выдумываем даты. in_progress_at
--    заполняется только из истории статусов. updated_at
--    для переходов не подставляем.
-- 5) RPC считают «В работу» по in_progress_at, открытия —
--    по opened_at, отказы — по rejected_at, создание —
--    по created_at, входящих — по responded_at.
--
-- Что НЕ меняет:
-- набор статусов, RLS заявок, суммы, несколько продуктов
-- на контакт, opened_at при повторном «Успешно открыта».
-- ============================================================

create table if not exists public.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id)
    on delete cascade,
  actor_id uuid references public.profiles (id)
    on delete set null,
  action_type text not null default 'updated',
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.application_history
  add column if not exists actor_id uuid;

alter table public.application_history
  add column if not exists action_type text;

alter table public.application_history
  add column if not exists field_name text;

alter table public.application_history
  add column if not exists old_value text;

alter table public.application_history
  add column if not exists new_value text;

alter table public.application_history
  add column if not exists created_at timestamptz;

update public.application_history
set action_type = coalesce(action_type, 'updated')
where action_type is null;

update public.application_history
set created_at = timezone('utc', now())
where created_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'application_history_actor_id_fkey'
  ) then
    begin
      alter table public.application_history
        add constraint application_history_actor_id_fkey
        foreign key (actor_id)
        references public.profiles (id)
        on delete set null;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end
$$;

create index if not exists application_history_application_created_idx
on public.application_history (application_id, created_at desc);

create index if not exists application_history_status_idx
on public.application_history (application_id, created_at)
where field_name = 'status';

comment on table public.application_history is
  'Журнал изменений заявки. Каждая смена статуса — отдельная строка.';

alter table public.applications
  add column if not exists in_progress_at timestamptz;

comment on column public.applications.in_progress_at is
  'Дата и время первого перехода заявки во «В работе». Фиксируется один раз. Не выдумывается из updated_at.';

create index if not exists applications_in_progress_at_idx
on public.applications (in_progress_at)
where in_progress_at is not null;

create index if not exists applications_manager_in_progress_idx
on public.applications (assigned_manager_id, in_progress_at)
where in_progress_at is not null;

-- История: первый известный переход во «В работе».
update public.applications as a
set in_progress_at = h.first_in_progress_at
from (
  select
    application_id,
    min(created_at) as first_in_progress_at
  from public.application_history
  where field_name = 'status'
    and new_value = 'in_progress'
  group by application_id
) as h
where a.id = h.application_id
  and a.in_progress_at is null;

create or replace function public.set_application_in_progress_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'in_progress'
    and new.in_progress_at is null
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'in_progress'
    ) then
    new.in_progress_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_application_in_progress_at_trigger
on public.applications;

create trigger set_application_in_progress_at_trigger
before insert or update of status on public.applications
for each row
execute function public.set_application_in_progress_at();

-- Каноническая запись истории. Не удаляет прошлые события.
create or replace function public.record_application_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value,
      created_at
    )
    values (
      new.id,
      coalesce(v_actor, new.created_by),
      'created',
      null,
      null,
      new.status,
      coalesce(new.created_at, timezone('utc', now()))
    );

    if new.status is not null
      and new.status is distinct from 'new'
      and new.status is distinct from 'waiting' then
      insert into public.application_history (
        application_id,
        actor_id,
        action_type,
        field_name,
        old_value,
        new_value,
        created_at
      )
      values (
        new.id,
        coalesce(v_actor, new.created_by),
        'updated',
        'status',
        'new',
        new.status,
        coalesce(new.created_at, timezone('utc', now()))
      );
    end if;

    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value,
      created_at
    )
    values (
      new.id,
      v_actor,
      'updated',
      'status',
      old.status,
      new.status,
      timezone('utc', now())
    );
  end if;

  if old.assigned_manager_id is distinct from new.assigned_manager_id then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value
    )
    values (
      new.id,
      v_actor,
      'updated',
      'assigned_manager_id',
      old.assigned_manager_id::text,
      new.assigned_manager_id::text
    );
  end if;

  if old.comment is distinct from new.comment then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value
    )
    values (
      new.id,
      v_actor,
      'updated',
      'comment',
      old.comment,
      new.comment
    );
  end if;

  if old.amount is distinct from new.amount then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value
    )
    values (
      new.id,
      v_actor,
      'updated',
      'amount',
      old.amount::text,
      new.amount::text
    );
  end if;

  if old.product is distinct from new.product
    or old.product_id is distinct from new.product_id then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value
    )
    values (
      new.id,
      v_actor,
      'updated',
      'product',
      old.product,
      new.product
    );
  end if;

  if old.pp_id is distinct from new.pp_id then
    insert into public.application_history (
      application_id,
      actor_id,
      action_type,
      field_name,
      old_value,
      new_value
    )
    values (
      new.id,
      v_actor,
      'updated',
      'pp_id',
      old.pp_id,
      new.pp_id
    );
  end if;

  return new;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select t.tgname
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'applications'
      and not t.tgisinternal
      and t.tgname not in (
        'applications_record_history_insert',
        'applications_record_history_update',
        'set_application_rejected_at_trigger',
        'set_application_in_progress_at_trigger'
      )
      and (
        pg_get_triggerdef(t.oid) ilike '%application_history%'
        or exists (
          select 1
          from pg_proc as p
          where p.oid = t.tgfoid
            and pg_get_functiondef(p.oid) ilike '%application_history%'
        )
      )
  loop
    execute format(
      'drop trigger if exists %I on public.applications',
      rec.tgname
    );
  end loop;
end
$$;

drop trigger if exists applications_record_history_insert
on public.applications;

drop trigger if exists applications_record_history_update
on public.applications;

create trigger applications_record_history_insert
after insert on public.applications
for each row
execute function public.record_application_history();

create trigger applications_record_history_update
after update on public.applications
for each row
execute function public.record_application_history();

-- Достоверные события старых заявок: только известные даты.
insert into public.application_history (
  application_id,
  actor_id,
  action_type,
  field_name,
  old_value,
  new_value,
  created_at
)
select
  a.id,
  a.created_by,
  'created',
  null,
  null,
  a.status,
  a.created_at
from public.applications as a
where a.created_at is not null
  and not exists (
    select 1
    from public.application_history as h
    where h.application_id = a.id
      and h.action_type = 'created'
  );

insert into public.application_history (
  application_id,
  actor_id,
  action_type,
  field_name,
  old_value,
  new_value,
  created_at
)
select
  a.id,
  a.created_by,
  'updated',
  'status',
  null,
  'in_progress',
  a.in_progress_at
from public.applications as a
where a.in_progress_at is not null
  and not exists (
    select 1
    from public.application_history as h
    where h.application_id = a.id
      and h.field_name = 'status'
      and h.new_value = 'in_progress'
  );

insert into public.application_history (
  application_id,
  actor_id,
  action_type,
  field_name,
  old_value,
  new_value,
  created_at
)
select
  a.id,
  a.created_by,
  'updated',
  'status',
  null,
  'approved',
  coalesce(a.opened_at, a.approved_at)
from public.applications as a
where coalesce(a.opened_at, a.approved_at) is not null
  and not exists (
    select 1
    from public.application_history as h
    where h.application_id = a.id
      and h.field_name = 'status'
      and h.new_value = 'approved'
  );

insert into public.application_history (
  application_id,
  actor_id,
  action_type,
  field_name,
  old_value,
  new_value,
  created_at
)
select
  a.id,
  a.created_by,
  'updated',
  'status',
  null,
  'rejected',
  a.rejected_at
from public.applications as a
where a.rejected_at is not null
  and not exists (
    select 1
    from public.application_history as h
    where h.application_id = a.id
      and h.field_name = 'status'
      and h.new_value = 'rejected'
  );

alter table public.application_history enable row level security;

drop policy if exists "application_history_select_own_or_privileged"
on public.application_history;

create policy "application_history_select_own_or_privileged"
on public.application_history
for select
to authenticated
using (
  public.is_privileged_crm_user()
  or exists (
    select 1
    from public.applications as a
    where a.id = application_history.application_id
      and a.assigned_manager_id = auth.uid()
  )
);

drop policy if exists "application_history_insert_via_owner"
on public.application_history;

-- INSERT идёт из SECURITY DEFINER-триггера.
-- Политика нужна, если клиент когда-либо пишет напрямую.
create policy "application_history_insert_via_owner"
on public.application_history
for insert
to authenticated
with check (
  public.is_privileged_crm_user()
  or exists (
    select 1
    from public.applications as a
    where a.id = application_history.application_id
      and a.assigned_manager_id = auth.uid()
  )
);

grant select on public.application_history to authenticated;

-- ---------- RPC: входящие ----------

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
set statement_timeout = '8s'
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
    'in_progress', (
      select count(*)::bigint
      from public.applications as a
      where a.in_progress_at is not null
        and (p_from is null or a.in_progress_at >= p_from)
        and (p_to is null or a.in_progress_at < p_to)
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

grant execute on function public.get_crm_period_stats(timestamptz, timestamptz, uuid)
to authenticated;

drop function if exists public.get_crm_manager_analytics(timestamptz, timestamptz, uuid);

create or replace function public.get_crm_manager_analytics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
)
returns table (
  manager_id uuid,
  responded bigint,
  applications bigint,
  in_progress bigint,
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
        and a.in_progress_at is not null
        and (p_from is null or a.in_progress_at >= p_from)
        and (p_to is null or a.in_progress_at < p_to)
    ) as in_progress,
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

grant execute on function public.get_crm_manager_analytics(timestamptz, timestamptz, uuid)
to authenticated;

-- ---------- RPC: заявки ----------

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
  select jsonb_build_object(
    'total', (
      select count(*)::bigint
      from public.applications as a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'new_applications', (
      select count(*)::bigint
      from public.applications as a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'in_progress', (
      select count(*)::bigint
      from public.applications as a
      where a.in_progress_at is not null
        and (p_from is null or a.in_progress_at >= p_from)
        and (p_to is null or a.in_progress_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'opened', (
      select count(*)::bigint
      from public.applications as a
      where coalesce(a.opened_at, a.approved_at) is not null
        and (
          p_from is null
          or coalesce(a.opened_at, a.approved_at) >= p_from
        )
        and (
          p_to is null
          or coalesce(a.opened_at, a.approved_at) < p_to
        )
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (p_product_id is null or a.product_id = p_product_id)
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a
      where a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
      from public.applications as a
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
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
  from public.applications as a
  where a.status = 'approved'
    and coalesce(a.opened_at, a.approved_at) is not null
    and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
    and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
    and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
  with managers as (
    select
      p.id,
      coalesce(
        nullif(trim(p.full_name), ''),
        'Без имени'
      ) as name
    from public.profiles as p
    where lower(trim(p.role)) in ('manager', 'head')
      and lower(trim(coalesce(p.status, 'active'))) <> 'blocked'
      and (p_manager_id is null or p.id = p_manager_id)
  ),
  created as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a
    where a.assigned_manager_id is not null
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
      and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
      and (p_product_id is null or a.product_id = p_product_id)
    group by a.assigned_manager_id
  ),
  in_progress as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a
    where a.assigned_manager_id is not null
      and a.in_progress_at is not null
      and (p_from is null or a.in_progress_at >= p_from)
      and (p_to is null or a.in_progress_at < p_to)
      and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
    from public.applications as a
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
      and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
      and (p_product_id is null or a.product_id = p_product_id)
    group by a.assigned_manager_id
  ),
  rejected as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a
    where a.assigned_manager_id is not null
      and a.rejected_at is not null
      and (p_from is null or a.rejected_at >= p_from)
      and (p_to is null or a.rejected_at < p_to)
      and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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

-- ---------- RPC: написавшие ----------
-- Список контактов по-прежнему фильтруется по responded_at.
-- Карточки сводки считают события по СВОИМ датам, а не
-- «заявки тех, кто написал в периоде».

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
  with writer_scope as (
    select mc.id
    from public.mailing_contacts as mc
    where mc.responded_at is not null
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
    ),
    'applications', (
      select count(*)::bigint
      from public.applications as a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (
          p_mailing_id is null
          or coalesce(p_external_only, false)
          or a.mailing_id = p_mailing_id
          or a.mailing_contact_id in (select id from writer_scope)
        )
        and (
          not coalesce(p_external_only, false)
          or a.mailing_contact_id in (select id from writer_scope)
        )
    ),
    'in_progress', (
      select count(*)::bigint
      from public.applications as a
      where a.in_progress_at is not null
        and (p_from is null or a.in_progress_at >= p_from)
        and (p_to is null or a.in_progress_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (
          p_mailing_id is null
          or coalesce(p_external_only, false)
          or a.mailing_id = p_mailing_id
          or a.mailing_contact_id in (select id from writer_scope)
        )
        and (
          not coalesce(p_external_only, false)
          or a.mailing_contact_id in (select id from writer_scope)
        )
    ),
    'opened', (
      select count(*)::bigint
      from public.applications as a
      where coalesce(a.opened_at, a.approved_at) is not null
        and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
        and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (
          p_mailing_id is null
          or coalesce(p_external_only, false)
          or a.mailing_id = p_mailing_id
          or a.mailing_contact_id in (select id from writer_scope)
        )
        and (
          not coalesce(p_external_only, false)
          or a.mailing_contact_id in (select id from writer_scope)
        )
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a
      where a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
        and (
          p_mailing_id is null
          or coalesce(p_external_only, false)
          or a.mailing_id = p_mailing_id
          or a.mailing_contact_id in (select id from writer_scope)
        )
        and (
          not coalesce(p_external_only, false)
          or a.mailing_contact_id in (select id from writer_scope)
        )
    ),
    'managers', (
      select count(distinct mc.manager_id)::bigint
      from public.mailing_contacts as mc
      where mc.responded_at is not null
        and mc.manager_id is not null
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
  );
$$;

grant execute on function public.get_responded_writers_stats(
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  boolean
) to authenticated;

notify pgrst, 'reload schema';
