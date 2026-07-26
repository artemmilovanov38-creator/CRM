-- ============================================================
-- Расширение таблицы mailings для учета партий рассылки
-- Файл: supabase/migrations/002_update_mailings.sql
-- ============================================================

-- Название партии.
alter table public.mailings
add column if not exists name text;

-- Поставщик лидов.
alter table public.mailings
add column if not exists supplier text;

-- Общая стоимость закупки партии.
alter table public.mailings
add column if not exists purchase_cost numeric(12, 2)
not null default 0;

-- Изначальное количество контактов в партии.
alter table public.mailings
add column if not exists total_leads integer
not null default 0;

-- Контакты, у которых найден Telegram.
alter table public.mailings
add column if not exists telegram_found_count integer
not null default 0;

-- Контакты, у которых Telegram не найден.
alter table public.mailings
add column if not exists telegram_not_found_count integer
not null default 0;

-- Количество контактов, переданных менеджерам.
alter table public.mailings
add column if not exists distributed_count integer
not null default 0;

-- Количество контактов, которым отправили сообщение.
alter table public.mailings
add column if not exists sent_count integer
not null default 0;

-- Количество людей, которые написали менеджерам.
alter table public.mailings
add column if not exists responded_count integer
not null default 0;

-- Количество созданных заявок.
alter table public.mailings
add column if not exists applications_count integer
not null default 0;

-- Количество подтвержденных открытий.
alter table public.mailings
add column if not exists openings_count integer
not null default 0;

-- Метод рассылки.
alter table public.mailings
add column if not exists mailing_method text;

-- Дата запуска партии.
alter table public.mailings
add column if not exists started_at timestamptz;

-- Дата завершения партии.
alter table public.mailings
add column if not exists completed_at timestamptz;

-- Комментарий администратора.
alter table public.mailings
add column if not exists comment text;

-- Автор партии.
alter table public.mailings
add column if not exists created_by uuid
references public.profiles(id)
on delete set null;

-- Дата изменения.
alter table public.mailings
add column if not exists updated_at timestamptz
not null default now();

-- Проверки, запрещающие отрицательные значения.
alter table public.mailings
drop constraint if exists mailings_purchase_cost_check;

alter table public.mailings
add constraint mailings_purchase_cost_check
check (purchase_cost >= 0);

alter table public.mailings
drop constraint if exists mailings_total_leads_check;

alter table public.mailings
add constraint mailings_total_leads_check
check (total_leads >= 0);

alter table public.mailings
drop constraint if exists mailings_telegram_found_count_check;

alter table public.mailings
add constraint mailings_telegram_found_count_check
check (telegram_found_count >= 0);

alter table public.mailings
drop constraint if exists mailings_telegram_not_found_count_check;

alter table public.mailings
add constraint mailings_telegram_not_found_count_check
check (telegram_not_found_count >= 0);

alter table public.mailings
drop constraint if exists mailings_distributed_count_check;

alter table public.mailings
add constraint mailings_distributed_count_check
check (distributed_count >= 0);

alter table public.mailings
drop constraint if exists mailings_sent_count_check;

alter table public.mailings
add constraint mailings_sent_count_check
check (sent_count >= 0);

alter table public.mailings
drop constraint if exists mailings_responded_count_check;

alter table public.mailings
add constraint mailings_responded_count_check
check (responded_count >= 0);

alter table public.mailings
drop constraint if exists mailings_applications_count_check;

alter table public.mailings
add constraint mailings_applications_count_check
check (applications_count >= 0);

alter table public.mailings
drop constraint if exists mailings_openings_count_check;

alter table public.mailings
add constraint mailings_openings_count_check
check (openings_count >= 0);

-- Допустимые статусы партии.
-- Ограничение создаем только в том случае, если поля status еще нет
-- со своим несовместимым ограничением.
alter table public.mailings
add column if not exists status text
not null default 'draft';

-- Удаляем наше ограничение при повторном запуске.
alter table public.mailings
drop constraint if exists mailings_crm_status_check;

alter table public.mailings
add constraint mailings_crm_status_check
check (
  status in (
    'draft',
    'processing',
    'ready',
    'running',
    'paused',
    'completed',
    'cancelled'
  )
);

-- Индексы для быстрой фильтрации.
create index if not exists mailings_status_idx
on public.mailings(status);

create index if not exists mailings_created_at_idx
on public.mailings(created_at desc);

create index if not exists mailings_started_at_idx
on public.mailings(started_at desc);

create index if not exists mailings_created_by_idx
on public.mailings(created_by);

-- Автоматическое обновление updated_at.
create or replace function public.update_mailings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mailings_set_updated_at
on public.mailings;

create trigger mailings_set_updated_at
before update on public.mailings
for each row
execute function public.update_mailings_updated_at();

-- Представление с автоматически рассчитанной экономикой партии.
create or replace view public.mailing_financial_metrics as
select
  mailings.id,
  mailings.name,
  mailings.status,
  mailings.purchase_cost,
  mailings.total_leads,
  mailings.telegram_found_count,
  mailings.telegram_not_found_count,
  mailings.distributed_count,
  mailings.sent_count,
  mailings.responded_count,
  mailings.applications_count,
  mailings.openings_count,

  case
    when mailings.responded_count > 0
      then round(
        mailings.purchase_cost / mailings.responded_count,
        2
      )
    else null
  end as cost_per_response,

  case
    when mailings.applications_count > 0
      then round(
        mailings.purchase_cost / mailings.applications_count,
        2
      )
    else null
  end as cost_per_application,

  case
    when mailings.openings_count > 0
      then round(
        mailings.purchase_cost / mailings.openings_count,
        2
      )
    else null
  end as cost_per_opening,

  case
    when mailings.sent_count > 0
      then round(
        mailings.responded_count::numeric
        / mailings.sent_count::numeric
        * 100,
        2
      )
    else 0
  end as response_conversion_percent,

  case
    when mailings.responded_count > 0
      then round(
        mailings.applications_count::numeric
        / mailings.responded_count::numeric
        * 100,
        2
      )
    else 0
  end as application_conversion_percent,

  case
    when mailings.applications_count > 0
      then round(
        mailings.openings_count::numeric
        / mailings.applications_count::numeric
        * 100,
        2
      )
    else 0
  end as opening_conversion_percent,

  mailings.created_at,
  mailings.started_at,
  mailings.completed_at
from public.mailings;