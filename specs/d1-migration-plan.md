# Migration Plan — Supabase (Postgres+GoTrue+PostgREST) → Cloudflare D1+Workers

Status: **Phase 1 in progress.** Nothing in production has changed yet — Supabase remains
the live backend for both `tambalban` (Android) and `tambalban-web` until Phase 4 (cutover)
is verified stable.

## Why

Supabase free-tier org limit (2 active projects) is hit. Cloudflare D1+Workers free tier
(5M row reads/day, 100k row writes/day, 100k Worker requests/day) comfortably covers this
project's scale, and consolidates onto the stack `tambalban-web` already runs on.

## Topology decision

**One Worker, not two.** Extend the existing `tambalban-web` Hono app rather than standing up
a separate `tambalban-api` service:
- Bearer-token JSON routes added for the Android app (login/register/profile/reviews/nearby-search).
- Existing cookie+HTML routes for the browser stay as they are.
- One D1 binding shared by both surfaces — mirrors the current "one Supabase project, two
  front doors" model instead of forking it.

## Schema (Postgres → SQLite/D1)

- `uuid` → `TEXT`, generated via `crypto.randomUUID()` in the Worker (no DB-level default).
- `jsonb` (`osm_tags`) → `TEXT`, JSON-serialized in the app layer.
- `timestamptz` → `TEXT` ISO-8601 (`new Date().toISOString()`).
- `boolean` → `INTEGER` (0/1).
- **`tambal_ban.rating` and `tambal_ban.total_reviews` are dropped entirely** — their origin
  couldn't be traced to any trigger or client code in either repo; decided not worth
  replicating blind (2026-08-26 decision).
- `auth.users` + `users_profile` merge into a single `users` table — no more two-table sync,
  no `handle_new_user` trigger needed.
- `tambal_ban`/`reviews` structure otherwise unchanged (all columns, FKs, indexes carry over).
- D1 is real SQLite — `updated_at` auto-refresh can stay a `CREATE TRIGGER`, not Worker code.
- `set_tambal_ban_user_id` trigger is dropped — the Worker verifies the session and sets
  `user_id` directly in the `INSERT`, no trigger needed.

See `worker/migrations/d1/0001_init.sql` for the DDL (Phase 1 deliverable).

## Auth

Custom email+password, session tokens — **not** the AntPOS-style static-API-key pattern from
the original migration prompt (rejected 2026-08-26: this project has public self-registration
via a real Login/Register screen on both apps; an API-key model doesn't fit that UX and would
force a client-facing redesign for no benefit).

- `users` table: `id, email UNIQUE, password_hash, username, full_name, phone, avatar_url,
  created_at, updated_at`. Password hashed with scrypt via Web Crypto (native to Workers,
  no dependency).
- `sessions` table: `token (PK), user_id, expires_at, created_at`.
- Android: `Authorization: Bearer <token>`. Web: same token, delivered via the existing
  HttpOnly cookie pattern.
- **No client-visible UX change** — Login/Register screens keep asking for email+password.

## RLS → Worker-side guards

| Postgres RLS policy | Worker equivalent |
|---|---|
| `public_read_verified` | `WHERE verified=1` hardcoded on every public GET |
| `user_insert` (tambal_ban) | Session required; `user_id`/`verified=0`/`source='user'` set server-side, never client-supplied |
| `user_read_own_unverified` | `WHERE verified=1 OR (source='user' AND user_id=:callerId)` |
| `public_read_reviews` | No filter |
| `user_insert_review` | Session required, stamp `user_id` |
| `user_update_own_review` | Session required, `WHERE user_id=:callerId` guard |
| `users_profile` read/update | Read from `users`, **always exclude `password_hash`** from any response |
| Admin bypass | Unchanged — existing `isAdmin()` HMAC-session gate, skips the `verified=1` filter |

## Storage → R2

Buckets `workshops` and `avatars`, same path convention as today. Data migration must rewrite
`image_url`/`avatar_url` values from the Supabase Storage domain to the new R2 public URL.

## CI/CD

Extend `tambalban-web/.github/workflows/ci.yml`: add `wrangler d1 migrations apply` (dry-run
on PR, applied on push to `main`) before the existing `wrangler deploy` step. Confirm the
existing `CLOUDFLARE_API_TOKEN` secret's scope includes `d1:write` before Phase 1 lands in CI
— the "Edit Cloudflare Workers" template usually does, but this needs verifying, not assuming.
Android CI is unaffected (it only consumes the API).

## Open question for Phase 2/3

**Password migration.** GoTrue's password hashes can't be carried over as-is (different
algorithm). Two options to decide before Phase 3 (data migration):
1. Force a one-time password reset for every existing user post-cutover.
2. "Migrate on first login": verify against Supabase Auth in the background on the user's
   next login, and only then write a new D1 row with a freshly-hashed password.

Not decided yet — revisit before Phase 3.

## Phased plan

1. **Setup D1 + schema.** Create the D1 database, apply `0001_init.sql`. Nothing in production
   changes. *(current phase)*
2. **Worker API, read-only-verify first.** Add the new bearer-token routes mirroring what
   Android needs, running in parallel with Supabase — read-only against D1 (seeded with a
   copy of current data) to verify query correctness before any write path is trusted.
3. **Historical data migration.** Dump Supabase (`supabase db dump --data-only`), transform
   (drop rating/total_reviews, merge auth.users+users_profile, rewrite storage URLs, convert
   booleans/timestamps), load via `wrangler d1 execute`. Resolve the password-migration
   question above before this phase.
4. **Cutover.** Point the Android app and the web app at the new Worker routes /
   bearer-auth flow. Keep Supabase live and unmodified during this phase as a fallback.
5. **Retire Supabase** — only after Phase 4 has been stable for several days. Pause/delete
   the Supabase project only then, never before.

**Do not pause or delete the Supabase project before Phase 4 is verified stable** — that
removes the fallback if the migration has a bug.
