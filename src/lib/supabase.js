import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Не найдена переменная VITE_SUPABASE_URL в .env.local"
  );
}

if (!supabasePublishableKey) {
  throw new Error(
    "Не найдена переменная VITE_SUPABASE_PUBLISHABLE_KEY в .env.local"
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);