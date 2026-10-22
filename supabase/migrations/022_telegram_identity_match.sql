-- ============================================================
-- Ник человека не путается с упоминанием в чужой строке
-- Файл: supabase/migrations/022_telegram_identity_match.sql
--
-- Почему:
-- contact_matches_telegram считал совпадением первое @упоминание
-- в комментарии, сыром импорте и даже во всём JSON. Из-за этого
-- новый человек не создавался, а в «Моих контактах» его не было:
-- у найденной строки в поле Telegram записан другой ник.
--
-- Что делает:
-- 1) Совпадение по telegram_username и full_name остаётся.
-- 2) Комментарий и значения raw_data учитываются только если
--    своего Telegram у строки ещё нет.
-- 3) Сплошной текст JSON больше не сравнивается.
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
      public.extract_telegram_username(p_username) = p_telegram_key
      or public.extract_telegram_username(p_full_name) = p_telegram_key
      or (
        public.extract_telegram_username(p_username) is null
        and (
          public.extract_telegram_username(p_comment) = p_telegram_key
          or (
            jsonb_typeof(coalesce(p_raw, '{}'::jsonb)) = 'object'
            and exists (
              select 1
              from jsonb_each_text(coalesce(p_raw, '{}'::jsonb)) as kv
              where public.extract_telegram_username(kv.value) = p_telegram_key
            )
          )
        )
      )
    );
$$;
