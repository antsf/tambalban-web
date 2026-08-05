import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi di .env.local",
  );
}

/**
 * Public client — respects RLS. Safe for reads and for inserting submissions.
 * Never use this to write into `workshops`.
 */
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
