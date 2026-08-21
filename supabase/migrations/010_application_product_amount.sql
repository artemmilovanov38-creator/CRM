-- ============================================================
-- Сумма продукта в заявке
-- Файл: supabase/migrations/010_application_product_amount.sql
--
-- Что меняет:
-- 1) Заполняет applications.amount из снимка ставки или
--    текущей цены продукта, если сумма раньше не сохранялась.
-- 2) Для успешных заявок без opening_price_snapshot копирует
--    сумму, чтобы зарплата считалась по конкретной заявке.
-- 3) sum_opened_amount суммирует coalesce(amount, snapshot),
--    а не только пустое поле amount.
--
-- Что НЕ меняет:
-- статусы, RLS, несколько заявок на один контакт.
-- ============================================================

update public.applications as a
set amount = coalesce(
  a.opening_price_snapshot,
  p.opening_price
)
from public.products as p
where a.product_id = p.id
  and a.amount is null
  and coalesce(
    a.opening_price_snapshot,
    p.opening_price
  ) is not null;

update public.applications as a
set opening_price_snapshot = coalesce(
  a.opening_price_snapshot,
  a.amount,
  p.opening_price
)
from public.products as p
where a.product_id = p.id
  and a.opening_price_snapshot is null
  and a.status = 'approved';

create or replace function public.sum_opened_amount(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_manager_id uuid default null
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
  where coalesce(a.opened_at, a.approved_at) is not null
    and (p_from is null or coalesce(a.opened_at, a.approved_at) >= p_from)
    and (p_to is null or coalesce(a.opened_at, a.approved_at) < p_to)
    and (p_manager_id is null or a.assigned_manager_id = p_manager_id);
$$;

grant execute on function public.sum_opened_amount(timestamptz, timestamptz, uuid)
to authenticated;
