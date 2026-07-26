-- ============================================================
-- Обновление допустимых статусов таблицы mailings
-- ============================================================

alter table public.mailings
drop constraint if exists mailings_status_check;

alter table public.mailings
drop constraint if exists mailings_crm_status_check;

alter table public.mailings
add constraint mailings_status_check
check (
  status in (
    'draft',
    'active',
    'running',
    'processing',
    'ready',
    'paused',
    'completed',
    'cancelled'
  )
);