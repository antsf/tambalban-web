export interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  NOMINATIM_USER_AGENT?: string;
  /** D1 migration (Phase 2, read-only-verify) — see specs/d1-migration-plan.md. Not yet in the production request path. */
  DB: D1Database;
}
