-- ============================================================
-- Оплаты партнёрок: ручная загрузка файла и статус на заявке
-- Файл: supabase/migrations/024_payout_imports.sql
--
-- Что меняет:
-- 1) На заявке хранится оплата отдельно от даты ЦД:
--    payment_status, сумма, дата подтверждения, месяц выплаты,
--    id и дата конверсии партнёрки.
-- 2) payout_imports — факт загрузки файла.
-- 3) payout_rows — строки выгрузки. Повтор той же партнёрки
--    и того же id конверсии обновляет строку, а не плодит дубль.
-- 4) apply_payout_import раскладывает уже сопоставленные строки
--    по заявкам. Месяц выплаты берётся из даты подтверждения,
--    а если её нет — из месяца, выбранного при загрузке.
--
-- Что НЕ меняет:
-- статусы заявок, зарплату, открытие квита.
-- ============================================================

alter table public.applications
  add column if not exists payment_status text,
  add column if not exists payment_amount numeric,
  add column if not exists paid_at timestamptz,
  add column if not exists payout_month date,
  add column if not exists partner_name text,
  add column if not exists partner_status text,
  add column if not exists partner_conversion_id text,
  add column if not exists partner_conversion_at timestamptz,
  add column if not exists partner_offer_name text;

alter table public.applications
  drop constraint if exists applications_payment_status_check;

alter table public.applications
  add constraint applications_payment_status_check
  check (
    payment_status is null
    or payment_status in ('paid', 'unpaid', 'cancelled')
  );

comment on column public.applications.payment_status is
  'Оплата партнёрки: paid, unpaid, cancelled. Пусто — заявки не было в выгрузке.';

comment on column public.applications.payout_month is
  'Месяц выплаты. Это не месяц ЦД.';

comment on column public.applications.partner_conversion_at is
  'Дата ЦД в выгрузке партнёрки.';

create index if not exists applications_payment_status_idx
  on public.applications (payment_status)
  where payment_status is not null;

create index if not exists applications_payout_month_idx
  on public.applications (payout_month)
  where payout_month is not null;

create index if not exists applications_partner_conversion_idx
  on public.applications (partner_name, partner_conversion_id)
  where partner_conversion_id is not null;

create table if not exists public.payout_imports (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  payout_month date,
  file_name text,
  format_key text not null,
  row_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  ambiguous_count integer not null default 0,
  paid_count integer not null default 0,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.payout_imports (id) on delete set null,
  partner_name text not null,
  external_conversion_id text not null,
  click_id text,
  offer_id text,
  offer_name text,
  sub1 text,
  phone text,
  client_name text,
  partner_status text,
  payment_status text not null,
  amount numeric,
  conversion_at timestamptz,
  confirmed_at timestamptz,
  application_id uuid references public.applications (id) on delete set null,
  match_status text not null,
  match_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_rows_partner_conversion_key
    unique (partner_name, external_conversion_id),
  constraint payout_rows_payment_status_check
    check (payment_status in ('paid', 'unpaid', 'cancelled')),
  constraint payout_rows_match_status_check
    check (match_status in ('matched', 'unmatched', 'ambiguous'))
);

create index if not exists payout_rows_match_status_idx
  on public.payout_rows (partner_name, match_status);

create index if not exists payout_rows_application_idx
  on public.payout_rows (application_id)
  where application_id is not null;

create index if not exists payout_imports_created_idx
  on public.payout_imports (created_at desc);

alter table public.payout_imports enable row level security;
alter table public.payout_rows enable row level security;

drop policy if exists "payout_imports_privileged_select"
  on public.payout_imports;
drop policy if exists "payout_imports_privileged_insert"
  on public.payout_imports;
drop policy if exists "payout_imports_privileged_update"
  on public.payout_imports;
drop policy if exists "payout_imports_privileged_delete"
  on public.payout_imports;

create policy "payout_imports_privileged_select"
on public.payout_imports
for select
to authenticated
using (public.is_privileged_crm_user());

create policy "payout_imports_privileged_insert"
on public.payout_imports
for insert
to authenticated
with check (public.is_privileged_crm_user());

create policy "payout_imports_privileged_update"
on public.payout_imports
for update
to authenticated
using (public.is_privileged_crm_user())
with check (public.is_privileged_crm_user());

create policy "payout_imports_privileged_delete"
on public.payout_imports
for delete
to authenticated
using (public.is_privileged_crm_user());

drop policy if exists "payout_rows_privileged_select"
  on public.payout_rows;
drop policy if exists "payout_rows_privileged_insert"
  on public.payout_rows;
drop policy if exists "payout_rows_privileged_update"
  on public.payout_rows;
drop policy if exists "payout_rows_privileged_delete"
  on public.payout_rows;

create policy "payout_rows_privileged_select"
on public.payout_rows
for select
to authenticated
using (public.is_privileged_crm_user());

create policy "payout_rows_privileged_insert"
on public.payout_rows
for insert
to authenticated
with check (public.is_privileged_crm_user());

create policy "payout_rows_privileged_update"
on public.payout_rows
for update
to authenticated
using (public.is_privileged_crm_user())
with check (public.is_privileged_crm_user());

create policy "payout_rows_privileged_delete"
on public.payout_rows
for delete
to authenticated
using (public.is_privileged_crm_user());

grant select, insert, update, delete
  on public.payout_imports to authenticated;
grant select, insert, update, delete
  on public.payout_rows to authenticated;

create or replace function public.apply_payout_import(
  p_partner_name text,
  p_payout_month date,
  p_file_name text,
  p_format_key text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_partner text;
  v_import_id uuid;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_ambiguous integer := 0;
  v_paid integer := 0;
  v_updated integer := 0;
begin
  if not public.is_privileged_crm_user() then
    raise exception 'Загружать выплаты могут руководитель и администратор';
  end if;

  v_partner := nullif(btrim(p_partner_name), '');

  if v_partner is null then
    raise exception 'Укажите название партнёрки';
  end if;

  if p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 then
    raise exception 'В файле нет строк';
  end if;

  insert into public.payout_imports (
    partner_name,
    payout_month,
    file_name,
    format_key,
    uploaded_by
  )
  values (
    v_partner,
    p_payout_month,
    nullif(btrim(coalesce(p_file_name, '')), ''),
    coalesce(nullif(btrim(p_format_key), ''), 'unknown'),
    auth.uid()
  )
  returning id into v_import_id;

  insert into public.payout_rows (
    import_id,
    partner_name,
    external_conversion_id,
    click_id,
    offer_id,
    offer_name,
    sub1,
    phone,
    client_name,
    partner_status,
    payment_status,
    amount,
    conversion_at,
    confirmed_at,
    application_id,
    match_status,
    match_note,
    updated_at
  )
  select
    v_import_id,
    v_partner,
    btrim(x.external_conversion_id),
    nullif(btrim(x.click_id), ''),
    nullif(btrim(x.offer_id), ''),
    nullif(btrim(x.offer_name), ''),
    nullif(btrim(x.sub1), ''),
    nullif(btrim(x.phone), ''),
    nullif(btrim(x.client_name), ''),
    nullif(btrim(x.partner_status), ''),
    case
      when x.payment_status in ('paid', 'unpaid', 'cancelled')
        then x.payment_status
      else 'unpaid'
    end,
    case
      when nullif(btrim(x.amount), '') is null then null
      else btrim(x.amount)::numeric
    end,
    case
      when nullif(btrim(x.conversion_at), '') is null then null
      else btrim(x.conversion_at)::timestamptz
    end,
    case
      when nullif(btrim(x.confirmed_at), '') is null then null
      else btrim(x.confirmed_at)::timestamptz
    end,
    case
      when x.match_status = 'matched'
        and nullif(btrim(x.application_id), '') is not null
        then btrim(x.application_id)::uuid
      else null
    end,
    case
      when x.match_status in ('matched', 'unmatched', 'ambiguous')
        then x.match_status
      else 'unmatched'
    end,
    nullif(btrim(x.match_note), ''),
    now()
  from jsonb_to_recordset(p_rows) as x(
    external_conversion_id text,
    click_id text,
    offer_id text,
    offer_name text,
    sub1 text,
    phone text,
    client_name text,
    partner_status text,
    payment_status text,
    amount text,
    conversion_at text,
    confirmed_at text,
    application_id text,
    match_status text,
    match_note text
  )
  where nullif(btrim(x.external_conversion_id), '') is not null
  on conflict (partner_name, external_conversion_id)
  do update set
    import_id = excluded.import_id,
    click_id = excluded.click_id,
    offer_id = excluded.offer_id,
    offer_name = excluded.offer_name,
    sub1 = excluded.sub1,
    phone = excluded.phone,
    client_name = excluded.client_name,
    partner_status = excluded.partner_status,
    payment_status = excluded.payment_status,
    amount = excluded.amount,
    conversion_at = excluded.conversion_at,
    confirmed_at = excluded.confirmed_at,
    application_id = excluded.application_id,
    match_status = excluded.match_status,
    match_note = excluded.match_note,
    updated_at = now();

  update public.payout_rows as row
  set
    match_status = 'ambiguous',
    application_id = null,
    match_note = 'Заявка уже связана с другой конверсией',
    updated_at = now()
  where row.import_id = v_import_id
    and row.match_status = 'matched'
    and row.application_id is not null
    and exists (
      select 1
      from public.payout_rows as other
      where other.partner_name = row.partner_name
        and other.application_id = row.application_id
        and other.match_status = 'matched'
        and other.external_conversion_id <> row.external_conversion_id
    );

  update public.applications as application
  set
    payment_status = null,
    payment_amount = null,
    paid_at = null,
    payout_month = null,
    partner_name = null,
    partner_status = null,
    partner_conversion_id = null,
    partner_conversion_at = null,
    partner_offer_name = null,
    updated_at = now()
  where application.partner_name = v_partner
    and application.partner_conversion_id in (
      select external_conversion_id
      from public.payout_rows
      where import_id = v_import_id
    )
    and not exists (
      select 1
      from public.payout_rows as row
      where row.partner_name = v_partner
        and row.external_conversion_id = application.partner_conversion_id
        and row.match_status = 'matched'
        and row.application_id = application.id
    );

  update public.applications as application
  set
    payment_status = row.payment_status,
    payment_amount = row.amount,
    paid_at = case
      when row.payment_status = 'paid' then row.confirmed_at
      else null
    end,
    payout_month = case
      when row.payment_status = 'paid' then coalesce(
        date_trunc('month', row.confirmed_at)::date,
        p_payout_month
      )
      else null
    end,
    partner_name = v_partner,
    partner_status = row.partner_status,
    partner_conversion_id = row.external_conversion_id,
    partner_conversion_at = row.conversion_at,
    partner_offer_name = row.offer_name,
    updated_at = now()
  from public.payout_rows as row
  where row.import_id = v_import_id
    and row.match_status = 'matched'
    and row.application_id = application.id;

  get diagnostics v_updated = row_count;

  select
    count(*) filter (where match_status = 'matched'),
    count(*) filter (where match_status = 'unmatched'),
    count(*) filter (where match_status = 'ambiguous'),
    count(*) filter (where payment_status = 'paid')
  into v_matched, v_unmatched, v_ambiguous, v_paid
  from public.payout_rows
  where import_id = v_import_id;

  update public.payout_imports
  set
    row_count = v_matched + v_unmatched + v_ambiguous,
    matched_count = v_matched,
    unmatched_count = v_unmatched,
    ambiguous_count = v_ambiguous,
    paid_count = v_paid
  where id = v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'rows', v_matched + v_unmatched + v_ambiguous,
    'matched', v_matched,
    'unmatched', v_unmatched,
    'ambiguous', v_ambiguous,
    'paid', v_paid,
    'applications_updated', v_updated
  );
end;
$$;

grant execute on function public.apply_payout_import(text, date, text, text, jsonb)
  to authenticated;
