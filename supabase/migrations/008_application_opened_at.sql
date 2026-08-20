-- ============================================================
-- Дата открытия квитка по заявке
-- Файл: supabase/migrations/008_application_opened_at.sql
--
-- Что меняет:
-- 1) Добавляет applications.opened_at — когда менеджер
--    нажал «Квит открыт».
-- 2) Для уже успешных заявок копирует дату из approved_at,
--    чтобы старые открытия не потерялись.
--
-- Что НЕ меняет:
-- статусный набор (new / in_progress / approved / rejected),
-- approved_at, opening_price_snapshot, зарплату и RLS.
-- Повторное нажатие «Квит открыт» не создаёт новую запись
-- и не двигает approved_at.
-- ============================================================

alter table public.applications
add column if not exists opened_at timestamptz;

comment on column public.applications.opened_at is
  'Дата и время, когда квит отмечен открытым. Фиксируется один раз.';

update public.applications
set opened_at = approved_at
where opened_at is null
  and approved_at is not null
  and status = 'approved';
