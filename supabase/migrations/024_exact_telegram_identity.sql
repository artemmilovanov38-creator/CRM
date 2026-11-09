-- ============================================================
-- Поиск ника не цепляет строку с другим Telegram
-- Файл: supabase/migrations/024_exact_telegram_identity.sql
--
-- Почему «ищу один ник, находит другой»:
-- contact_matches_telegram считал совпадением full_name,
-- даже когда в telegram_username уже записан другой человек.
-- Регистрация и поиск тогда открывали чужую карточку.
--
-- Что делает:
-- Если у строки есть свой Telegram, совпадает только он.
-- Имя, комментарий и сырой импорт учитываются только когда
-- своего ника ещё нет.
-- ============================================================

create or replace function public.contact_matches_telegram(
  p_username text,
  p_full_name text,
  p_raw jsonb,
  p_comment text,
  p_telegram_key text
)
returns boolean
language sql
immutable
as $$
  select
    p_telegram_key is not null
    and (
      case
        when public.extract_telegram_username(p_username) is not null
          then public.extract_telegram_username(p_username) = p_telegram_key
        when public.extract_telegram_username(p_full_name) is not null
          then public.extract_telegram_username(p_full_name) = p_telegram_key
        else
          public.extract_telegram_username(p_comment) = p_telegram_key
          or (
            jsonb_typeof(coalesce(p_raw, '{}'::jsonb)) = 'object'
            and exists (
              select 1
              from jsonb_each_text(coalesce(p_raw, '{}'::jsonb)) as kv
              where public.extract_telegram_username(kv.value) = p_telegram_key
            )
          )
      end
    );
$$;
