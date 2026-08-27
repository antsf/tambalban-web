export interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  NOMINATIM_USER_AGENT?: string;
  /** D1 migration — see specs/d1-migration-plan.md. Live for admin routes + public map/search (Phase 4c); auth/submit still on Supabase. */
  DB: D1Database;
  /** R2 migration (Phase 4b) — replaces Supabase Storage's `workshops` bucket. Served publicly via GET /images/workshops/:key (lib/r2.ts), not R2's own r2.dev domain. */
  WORKSHOPS_BUCKET: R2Bucket;
  /** R2 migration (Phase 4b) — replaces Supabase Storage's `avatars` bucket. Served publicly via GET /images/avatars/:key. */
  AVATARS_BUCKET: R2Bucket;
}
