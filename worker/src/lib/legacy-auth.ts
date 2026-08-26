import type { Env } from "./env";

/**
 * "Migrate on first login" — Phase 3 of the D1 migration (specs/d1-migration-plan.md).
 * Historically-migrated users land in D1 with `password_hash = NULL` (GoTrue's hash format
 * can't be carried over). The first time such a user logs in, verify their password against
 * the still-live Supabase Auth REST API; only on success does the caller write a fresh D1
 * password hash. On failure this returns false — the caller must show the same generic
 * "email/password salah" error as a normal wrong-password case, never reveal that this was
 * a migration check.
 */
export async function verifyAgainstSupabaseAuth(env: Env, email: string, password: string): Promise<boolean> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}
