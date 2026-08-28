-- ============================================================
-- Быстрая аналитика периода + исходный регистр Telegram
-- Файл: supabase/migrations/015_fast_period_analytics_and_telegram_display.sql
--
-- Что меняет:
-- 1) get_crm_manager_analytics — агрегаты GROUP BY вместо
--    коррелированных подзапросов на каждого менеджера.
-- 2) get_application_period_stats — все верхние счётчики
--    заявок и сумма успешных одним RPC.
-- 3) Индексы под фильтры opened_at / rejected_at / created_at.
-- 4) Входящий Telegram сохраняется с исходным регистром,
--    поиск дублей по-прежнему через normalize_telegram_username.
--
-- Что НЕ меняет:
-- RLS, статусы заявок, уникальность контакта+продукта.
-- ============================================================

create index if not exists applications_created_at_idx
on public.applications (created_at desc);

create index if not exists applications_opened_at_idx
on public.applications (opened_at)
where opened_at is not null;

create index if not exists applications_rejected_at_idx
on public.applications (rejected_at)
where rejected_at is not null;

create index if not exists applications_assigned_manager_opened_idx
on public.applications (assigned_manager_id, opened_at)
where opened_at is not null;

create or replace function public.format_telegram_username_display(value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            trim(coalesce(value, '')),
            '^https?://(www\.)?',
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
    ),
    ''
  );
$$;

grant execute on function public.format_telegram_username_display(text)
to authenticated;

drop function if exists public.get_crm_manager_analytics(timestamptz, timestamptz, uuid);

create or replace function public.get_crm_manager_analytics(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
)
returns table (
  manager_id uuid,
  name text,
  responded bigint,
  applications bigint,
  opened bigint,
  rejected bigint
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
  responded as (
    select
      mc.manager_id,
      count(*)::bigint as cnt
    from public.mailing_contacts as mc
    where mc.responded_at is not null
      and mc.manager_id is not null
      and (p_from is null or mc.responded_at >= p_from)
      and (p_to is null or mc.responded_at < p_to)
      and (p_manager_id is null or mc.manager_id = p_manager_id)
    group by mc.manager_id
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
    group by a.assigned_manager_id
  ),
  opened as (
    select
      a.assigned_manager_id as manager_id,
      count(*)::bigint as cnt
    from public.applications as a
    where a.assigned_manager_id is not null
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
    group by a.assigned_manager_id
  )
  select
    m.id as manager_id,
    m.name,
    coalesce(r.cnt, 0) as responded,
    coalesce(c.cnt, 0) as applications,
    coalesce(o.cnt, 0) as opened,
    coalesce(j.cnt, 0) as rejected
  from managers as m
  left join responded as r on r.manager_id = m.id
  left join created as c on c.manager_id = m.id
  left join opened as o on o.manager_id = m.id
  left join rejected as j on j.manager_id = m.id;
$$;

grant execute on function public.get_crm_manager_analytics(timestamptz, timestamptz, uuid)
to authenticated;

create or replace function public.get_application_period_stats(
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
    'total', (
      select count(*)::bigint
      from public.applications as a
      where (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
    ),
    'new_applications', (
      select count(*)::bigint
      from public.applications as a
      where a.status in ('new', 'waiting')
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
    ),
    'in_progress', (
      select count(*)::bigint
      from public.applications as a
      where a.status = 'in_progress'
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
    ),
    'rejected', (
      select count(*)::bigint
      from public.applications as a
      where a.rejected_at is not null
        and (p_from is null or a.rejected_at >= p_from)
        and (p_to is null or a.rejected_at < p_to)
        and (p_manager_id is null or a.assigned_manager_id = p_manager_id)
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
    )
  );
$$;

grant execute on function public.get_application_period_stats(timestamptz, timestamptz, uuid)
to authenticated;

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
  v_telegram_key text;
  v_phone text;
  v_display text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_manager_crm_user() then
    raise exception 'only manager can create incoming contacts';
  end if;

  v_telegram_key := public.normalize_telegram_username(p_telegram);
  v_display := public.format_telegram_username_display(p_telegram);

  if v_display is not null then
    v_telegram := '@' || v_display;
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
        v_telegram_key is not null
        and public.normalize_telegram_username(mc.telegram_username)
          = v_telegram_key
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
      telegram_username = coalesce(telegram_username, v_telegram),
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

grant execute on function public.create_incoming_external_contact(text, text, timestamptz)
to authenticated;
