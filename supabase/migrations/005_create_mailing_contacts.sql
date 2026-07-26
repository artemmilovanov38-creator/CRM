-- ============================================================
-- Контакты внутри партий рассылки
-- Файл: supabase/migrations/005_create_mailing_contacts.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.mailing_contacts (
  id uuid primary key default gen_random_uuid(),

  -- Партия, к которой относится контакт
  mailing_id uuid not null
  references public.mailings(id)
  on delete cascade,

  -- Исходные данные контакта
  full_name text,
  phone text,
  email text,

  -- Telegram-данные
  telegram_username text,
  telegram_user_id text,
  telegram_found boolean not null default false,

  -- Назначенный менеджер
  manager_id uuid
  references public.profiles(id)
  on delete set null,

  -- Текущий статус контакта
  status text not null default 'new',

  -- Когда контакт был передан менеджеру
  assigned_at timestamptz,

  -- Когда человеку отправили сообщение
  sent_at timestamptz,

  -- Когда человек написал менеджеру
  responded_at timestamptz,

  -- Когда по контакту создали заявку
  application_created_at timestamptz,

  -- Когда подтверждено открытие
  opened_at timestamptz,

  -- Источник строки внутри импортированного файла
  source_row_number integer,

  -- Дополнительные данные из Excel/CSV
  raw_data jsonb not null default '{}'::jsonb,

  comment text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Допустимые статусы контакта
alter table public.mailing_contacts
drop constraint if exists mailing_contacts_status_check;

alter table public.mailing_contacts
add constraint mailing_contacts_status_check
check (
  status in (
    'new',
    'telegram_found',
    'telegram_not_found',
    'assigned',
    'sent',
    'responded',
    'application',
    'opened',
    'rejected',
    'duplicate'
  )
);

-- Индексы
create index if not exists mailing_contacts_mailing_id_idx
on public.mailing_contacts(mailing_id);

create index if not exists mailing_contacts_manager_id_idx
on public.mailing_contacts(manager_id);

create index if not exists mailing_contacts_status_idx
on public.mailing_contacts(status);

create index if not exists mailing_contacts_phone_idx
on public.mailing_contacts(phone);

create index if not exists mailing_contacts_telegram_username_idx
on public.mailing_contacts(telegram_username);

create index if not exists mailing_contacts_created_at_idx
on public.mailing_contacts(created_at desc);

-- Защита от дублей внутри одной партии по телефону
create unique index if not exists mailing_contacts_unique_phone_per_mailing_idx
on public.mailing_contacts(mailing_id, phone)
where phone is not null and trim(phone) <> '';

-- Автообновление updated_at
create or replace function public.update_mailing_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mailing_contacts_set_updated_at
on public.mailing_contacts;

create trigger mailing_contacts_set_updated_at
before update on public.mailing_contacts
for each row
execute function public.update_mailing_contacts_updated_at();

-- Автоматическая синхронизация счетчиков в mailings
create or replace function public.refresh_mailing_counters(
  target_mailing_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.mailings
  set
    total_leads = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
    ),

    telegram_found_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and telegram_found = true
    ),

    telegram_not_found_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and status = 'telegram_not_found'
    ),

    distributed_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and manager_id is not null
    ),

    sent_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and sent_at is not null
    ),

    responded_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and responded_at is not null
    ),

    applications_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and application_created_at is not null
    ),

    openings_count = (
      select count(*)
      from public.mailing_contacts
      where mailing_id = target_mailing_id
        and opened_at is not null
    )

  where id = target_mailing_id;
end;
$$;

create or replace function public.sync_mailing_counters_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  affected_mailing_id uuid;
begin
  affected_mailing_id := coalesce(new.mailing_id, old.mailing_id);

  perform public.refresh_mailing_counters(
    affected_mailing_id
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists mailing_contacts_sync_counters
on public.mailing_contacts;

create trigger mailing_contacts_sync_counters
after insert or update or delete
on public.mailing_contacts
for each row
execute function public.sync_mailing_counters_trigger();

-- Включаем RLS
alter table public.mailing_contacts
enable row level security;

-- Удаляем политики при повторном запуске
drop policy if exists "Admins can view all mailing contacts"
on public.mailing_contacts;

drop policy if exists "Managers can view assigned mailing contacts"
on public.mailing_contacts;

drop policy if exists "Admins can create mailing contacts"
on public.mailing_contacts;

drop policy if exists "Admins can update mailing contacts"
on public.mailing_contacts;

drop policy if exists "Managers can update assigned mailing contacts"
on public.mailing_contacts;

drop policy if exists "Admins can delete mailing contacts"
on public.mailing_contacts;

-- Администратор видит все контакты
create policy "Admins can view all mailing contacts"
on public.mailing_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

-- Менеджер видит только назначенные ему контакты
create policy "Managers can view assigned mailing contacts"
on public.mailing_contacts
for select
to authenticated
using (
  manager_id = auth.uid()
);

-- Только администратор импортирует контакты
create policy "Admins can create mailing contacts"
on public.mailing_contacts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

-- Администратор может менять любые контакты
create policy "Admins can update mailing contacts"
on public.mailing_contacts
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

-- Менеджер может менять только назначенные ему контакты
create policy "Managers can update assigned mailing contacts"
on public.mailing_contacts
for update
to authenticated
using (
  manager_id = auth.uid()
)
with check (
  manager_id = auth.uid()
);

-- Только администратор удаляет контакты
create policy "Admins can delete mailing contacts"
on public.mailing_contacts
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);