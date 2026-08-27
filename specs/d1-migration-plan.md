# Migration Plan — Supabase (Postgres+GoTrue+PostgREST) → Cloudflare D1+Workers

Status: **Phase 3 done (2026-08-27).** D1 schema, bearer-token read API, and historical data
(55 users, 323 tambal_ban, 0 reviews) are all live in production D1. Nothing reads or writes
D1 in real traffic yet — Supabase remains the live backend for both `tambalban` (Android) and
`tambalban-web` until Phase 4 (cutover) is verified stable. See Phase 4/5 breakdown below for
what's still missing before Supabase can be retired.

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
  created_at, updated_at`. Password hashed with PBKDF2-SHA256 via native Web Crypto
  (`crypto.subtle`) — no new dependency. **Correction (2026-08-26, caught by a live smoke
  test against the deployed Worker, not by local Vitest):** Workers' `SubtleCrypto` caps
  PBKDF2 at 100,000 iterations (higher throws `NotSupportedError`); the original design
  assumed scrypt/600k-iteration PBKDF2 was available, neither is. Using 100,000 (the max the
  runtime allows). Local tests run in plain Node and do NOT catch this — Node's `crypto.subtle`
  has no such cap — so this class of bug only surfaces against the real Workers runtime.
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

1. ~~**Setup D1 + schema.**~~ Done (`5bc3f12`).
2. ~~**Worker API, read-only-verify first.**~~ Done (`4f11d35`, `6e82294`). `routes-d1.ts`
   currently covers: `POST /api/v2/auth/{register,login,logout}`, `GET /api/v2/profile`,
   `GET /api/v2/workshops`, `GET /api/v2/workshops/:id`, `GET /api/v2/workshops/:id/reviews`.
   Mounted alongside `routes.ts` (Supabase) in `index.ts`, not replacing it.
3. ~~**Historical data migration.**~~ Done 2026-08-27 (`71bd40e`,
   `scripts/migrate-supabase-to-d1.mjs`). Production D1: 55 users, 323 tambal_ban (315
   verified), 0 reviews — counts match Supabase exactly. Password migration question resolved:
   "migrate on first login" (Phase 3a, `fad527f`), already deployed and verified in prod.

4. **Cutover — remaining work, in dependency order:**

   a. ~~**Finish the D1 write API in `routes-d1.ts`.**~~ Done 2026-08-27. Added: `POST
      /api/v2/workshops` (submit — `user_id`/`source='user'`/`verified=0` set server-side from
      the session, never client-supplied; reuses `submissionSchema`), `POST
      /api/v2/workshops/:id/reviews` (stamps `user_id` from session, `reviewSchema` 1..5 rating
      check), `PATCH /api/v2/profile` (`username`/`full_name`/`phone`/`avatar_url` only — never
      `password_hash` or `email`), and admin routes `GET /api/v2/admin/submissions` (queue),
      `GET /api/v2/admin/workshops`, `POST .../publish`, `POST .../remove`, `POST
      .../bulk/publish`, `POST .../bulk/remove` — all behind the same `isAdmin()` HMAC-cookie
      gate as `routes.ts` (not bearer — admin is browser-only). New `d1.ts` functions:
      `insertWorkshopD1`, `insertReviewD1`, `updateProfileD1`, `fetchUnverifiedD1`,
      `fetchAllWorkshopsD1`, `publishWorkshopD1`, `removeWorkshopD1`, `bulkPublishD1`,
      `bulkRemoveD1`. New validation schemas: `reviewSchema`, `profileUpdateSchema`. Rate
      limited (`v2sub`/`v2rev` keys) via the existing `lib/rate-limit.ts`. 17 new Vitest cases
      in `routes-d1.test.ts` (101 total passing), plus the exact `INSERT`/`UPDATE` statements
      were smoke-tested against a real local D1 instance (`wrangler d1 execute --local`) to
      catch schema-mismatch bugs mocked unit tests can't. **Still not wired into `index.ts`
      as the live path** — `routes-d1.ts` stays mounted alongside `routes.ts`, unused by any
      production client, until 4c/4d actually point traffic at it.

   b. **Storage: Supabase Storage → R2.** Not started (`wrangler.jsonc` has no `r2_buckets`
      binding yet). Needed before Supabase can be fully retired, since `image_url`/`avatar_url`
      values in the migrated data still point at
      `https://xwqckmkjciptlbopmxjl.supabase.co/storage/v1/object/public/...`.
      - Create `workshops` and `avatars` R2 buckets, add `r2_buckets` binding to
        `wrangler.jsonc`.
      - Copy existing objects Supabase Storage → R2 (script, same shape as
        `migrate-supabase-to-d1.mjs`: list objects via Supabase Storage API, `PUT` into R2).
      - Rewrite `image_url`/`avatar_url` in D1 to the new R2 public URL/custom domain, for
        every row touched in Phase 3.
      - Point the upload path (`lib/image.ts` caller) at the R2 binding instead of Supabase
        Storage for new uploads.
      - This sub-phase can run **after** 4a/4c land — old Supabase Storage URLs keep working
        (Supabase stays live as fallback per the rule below), so it isn't a hard blocker for
        flipping DB traffic to D1. It IS a hard blocker for Phase 5 (Supabase retirement).

   c. **Web app cutover.** `routes.ts` (cookie+HTML, Supabase-backed) is the main app.
      **Admin routes done 2026-08-27** (lowest-risk slice, done first deliberately — see
      below): `/admin`, `/admin/data`, `/admin/users`, `/admin/reviews` + the `/api/admin/*`
      JSON endpoints (queue, publish, remove, bulk publish/remove) all now read/write D1 via
      `lib/d1.ts`, not Supabase. `routes.test.ts` updated to mock `./lib/d1` instead of
      `./lib/supabase` for these; a `toWorkshop()` adapter in `routes.ts` converts D1's
      0/1 integer booleans to the real booleans `views/pages.ts` still expects, so the view
      layer needed zero changes. Two new `d1.ts` functions: `fetchUsersD1` (no
      `last_sign_in_at` — D1's `users` table has no sign-in tracking, unlike Supabase Auth,
      always returns null there) and `fetchAllReviewsD1` (LEFT JOIN to `tambal_ban` for the
      workshop-name embed `fetchAllReviews` used to get from PostgREST). Public map/search,
      auth (register/login/logout), and submit are still on Supabase — deliberately deferred:
      those are live user-facing flows (not admin-only), so cutting them over needs its own
      `npm run dev` smoke-test pass and probably its own review checkpoint, not a
      continuation of this same pass.

      Two options for the remaining (public/auth/submit) routes — decide before starting,
      don't default silently:
      - **Merge:** rewrite `routes.ts` handlers to read/write D1 instead of Supabase REST,
        keep the existing cookie-session UX, retire `supabase-auth.ts`. Larger diff, one
        codebase.
      - **Swap:** keep `routes-d1.ts`'s bearer-token API, add a thin cookie-session shim in
        front of it for the browser routes. Smaller diff, but means running two auth
        mechanisms (bearer + cookie) against one `sessions` table.
      Recommendation: **Merge** — the "one Worker, not two" topology decision above already
      commits to one D1 binding shared by both surfaces; keeping `routes.ts` on Supabase
      indefinitely defeats that. Do this incrementally, route group by route group (public
      map/search first — read-only, lowest risk — then submit, then admin), each behind its
      own smoke test before moving to the next.

   d. **Android app cutover.** `tambalban/app/.../core/utils/SupabaseConfig.kt` currently
      points directly at `https://xwqckmkjciptlbopmxjl.supabase.co/`. Switch
      `SupabaseService`/`ApiClient`/`AuthInterceptor` (in `tambalban/`, not this repo) to call
      the Worker's `/api/v2/*` routes with `Authorization: Bearer <token>` instead of Supabase
      REST + Supabase Auth. This is a **separate PR in the `tambalban` repo**, coordinate
      timing with 4a (the write routes must exist first) and 4c (bump `SupabaseConfig`'s base
      URL to the Worker's domain once the equivalent D1 routes are confirmed stable).
      Ship behind a feature flag or staged rollout if the app has one; if not, at minimum
      verify against a beta/internal build before a public Play Store release.

   e. **Soak.** Once 4a–4d are live, run with Supabase still fully functional as an untouched
      fallback (read AND write — do not put Supabase in read-only mode yet) for **several days
      of real traffic** before Phase 5. Watch: Worker error rate, D1 query latency/errors in
      Cloudflare Observability, any user reports of missing submissions/reviews.

5. **Retire Supabase** — only after Phase 4 (all of 4a–4e, including storage) has been stable
   for several days.
   - Final incremental data sync: re-run (or re-diff) `migrate-supabase-to-d1.mjs` against
     Supabase to catch any writes that happened during the Phase 4 soak window before Supabase
     goes away — this repo's D1 write paths and Supabase were both live during 4e, so D1 may
     be missing rows Supabase gained during that window if traffic wasn't already 100% cut
     over the moment 4a shipped.
   - Remove `routes.ts`'s Supabase code paths, `supabase-auth.ts`, `lib/supabase.ts`, the
     `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` vars from `wrangler.jsonc`,
     and the `SUPABASE_SERVICE_ROLE_KEY` secret.
   - Pause, then after a further waiting period, delete the Supabase project.
   - Update `CLAUDE.md`'s Web App section (still describes Supabase REST as the backend) and
     check whether it affects the Android app's shared-schema assumptions
     (`tambalban/supabase_schema.sql` is documented there as the schema's owner — that
     document either needs to move to describe `0001_init.sql`/D1 as canonical, or both need
     to stay in sync manually going forward).

**Do not pause or delete the Supabase project before Phase 4 is verified stable** — that
removes the fallback if the migration has a bug.
