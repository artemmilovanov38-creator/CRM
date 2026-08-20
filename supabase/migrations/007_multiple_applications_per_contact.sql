-- ============================================================
-- Несколько заявок на один контакт
-- Файл: supabase/migrations/007_multiple_applications_per_contact.sql
--
-- Что меняет:
-- 1) Убирает unique только по mailing_contact_id / contact_id
--    (и одиночные unique по telegram/phone у заявки, если они есть).
--    Такое ограничение не даёт создать вторую заявку
--    на того же человека, даже на другой продукт.
-- 2) Оставляет уникальность только по паре
--    mailing_contact_id + product_id.
-- 3) Добавляет ручное поле pp_id («ID ПП»).
--
-- Что НЕ меняет:
-- существующие заявки, статусы, зарплату, входящие,
-- RLS менеджера/руководителя.
-- ============================================================

alter table public.applications
add column if not exists pp_id text;

comment on column public.applications.pp_id is
  'Ручной ID ПП. Менеджер вводит цифры сам, без справочника.';

do $$
declare
  rec record;
begin
  if to_regclass('public.applications') is null then
    raise notice 'Таблица applications не найдена';
    return;
  end if;

  -- Unique-ограничения, где единственная колонка —
  -- контакт. Именно они ломают сценарий
  -- «несколько заявок на разные продукты».
  for rec in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = t.oid
     and a.attnum = c.conkey[1]
    where n.nspname = 'public'
      and t.relname = 'applications'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and a.attname in (
        'mailing_contact_id',
        'contact_id',
        'telegram',
        'phone'
      )
  loop
    execute format(
      'alter table public.applications drop constraint if exists %I',
      rec.conname
    );

    raise notice 'Удалено unique-ограничение %', rec.conname;
  end loop;

  -- Unique-индексы на ту же одиночную колонку.
  for rec in
    select i.relname as index_name
    from pg_index x
    join pg_class t on t.oid = x.indrelid
    join pg_class i on i.oid = x.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = t.oid
     and a.attnum = x.indkey[0]
    where n.nspname = 'public'
      and t.relname = 'applications'
      and x.indisunique
      and not x.indisprimary
      and x.indnatts = 1
      and a.attname in (
        'mailing_contact_id',
        'contact_id',
        'telegram',
        'phone'
      )
  loop
    execute format(
      'drop index if exists public.%I',
      rec.index_name
    );

    raise notice 'Удалён unique-индекс %', rec.index_name;
  end loop;
end
$$;

-- Один контакт + один продукт = одна заявка.
-- Один контакт + разные продукты = несколько заявок.
do $$
begin
  if to_regclass('public.applications') is null then
    raise notice 'Таблица applications не найдена, unique index не создан';
  elsif exists (
    select 1
    from public.applications
    where mailing_contact_id is not null
      and product_id is not null
    group by mailing_contact_id, product_id
    having count(*) > 1
  ) then
    raise notice 'Пропущен индекс applications_contact_product_unique_idx: есть дубли заявок по одному продукту';
  else
    execute $sql$
      create unique index if not exists applications_contact_product_unique_idx
      on public.applications (mailing_contact_id, product_id)
      where mailing_contact_id is not null
        and product_id is not null
    $sql$;
  end if;
end
$$;
