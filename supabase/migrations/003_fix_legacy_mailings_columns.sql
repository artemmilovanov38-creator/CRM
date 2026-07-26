-- ============================================================
-- Совместимость старой и новой структуры таблицы mailings
-- ============================================================

-- Старые обязательные поля делаем необязательными,
-- потому что новая CRM использует name, supplier,
-- mailing_method и новые счетчики.

alter table public.mailings
alter column title drop not null;

alter table public.mailings
alter column channel drop not null;

alter table public.mailings
alter column source drop not null;

-- Если старые числовые поля существуют,
-- задаем им безопасные значения по умолчанию.

alter table public.mailings
alter column uploaded set default 0;

alter table public.mailings
alter column delivered set default 0;

alter table public.mailings
alter column replied set default 0;

alter table public.mailings
alter column applications set default 0;

alter table public.mailings
alter column openings set default 0;