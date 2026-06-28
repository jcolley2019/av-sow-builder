import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

if (!supabase) {
  console.warn(
    "[supabase] Not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local. The style library is disabled until then.",
  );
}
