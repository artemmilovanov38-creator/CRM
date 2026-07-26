-- ============================================================
-- Таблица продуктов CRM
-- Файл: supabase/migrations/001_create_products.sql
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  name text not null,

  description text,

  is_active boolean not null default true,

  created_by uuid references public.profiles(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

-- Названия продуктов не должны повторяться.
create unique index if not exists products_name_unique_idx
  on public.products (lower(trim(name)));

-- Индекс для быстрого получения активных продуктов.
create index if not exists products_is_active_idx
  on public.products (is_active);

-- Автоматическое обновление updated_at.
create or replace function public.update_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at
  on public.products;

create trigger products_set_updated_at
before update on public.products
for each row
execute function public.update_products_updated_at();

-- Включаем защиту строк Supabase.
alter table public.products enable row level security;

-- Удаляем старые политики с такими названиями, если SQL запускается повторно.
drop policy if exists "Authenticated users can view products"
  on public.products;

drop policy if exists "Admins can create products"
  on public.products;

drop policy if exists "Admins can update products"
  on public.products;

drop policy if exists "Admins can delete products"
  on public.products;

-- Все авторизованные пользователи видят активные продукты.
-- Администратор видит также отключенные продукты.
create policy "Authenticated users can view products"
on public.products
for select
to authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  )
);

-- Только администратор может создавать продукты.
create policy "Admins can create products"
on public.products
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

-- Только администратор может редактировать продукты.
create policy "Admins can update products"
on public.products
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

-- Только администратор может удалять продукты.
create policy "Admins can delete products"
on public.products
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

-- Добавляем несколько стартовых продуктов.
-- Позже их можно будет изменить через CRM.
insert into public.products (name)
values
  ('Альфа'),
  ('Т-Банк'),
  ('ВТБ'),
  ('Озон'),
  ('Газпромбанк')
on conflict do nothing;