# CLAUDE.md — TambalBan Web

Project-specific instructions for Claude Code working in this repo.

Read `soul.md` for project philosophy. Read `SPEC.md` for the full technical spec. This repo is the web sibling of the [`tambalban`](../tambalban) Android app — both read/write the **same Supabase project**; check `../tambalban/supabase_schema.sql` and `../tambalban/CLAUDE.md` before changing anything that touches shared tables (`workshops`, `workshop_submissions`).

---

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) on Vercel
- **Database:** Supabase (PostgreSQL) — shared with the Android app, no PostGIS
- **Map:** Leaflet via `react-leaflet` + OpenStreetMap tiles. Nominatim for geocoding (proxied through `/api/geocode`, never called from the browser directly).
- **Language:** TypeScript strict mode
- **Styling:** Tailwind CSS v4
- **Validation:** Zod v4
- **Auth:** No Supabase Auth, no NextAuth. Single shared `ADMIN_PASSWORD` + HMAC-signed session cookie (`src/lib/auth.ts`), scoped only to `/admin/*`.

---

## Architectural Decisions — Do Not Violate

1. **Submissions are invisible until approved.** `/api/workshops` reads only from `workshops`, never `workshop_submissions`. Never expose pending/rejected data on a public route.
2. **`SUPABASE_SERVICE_ROLE_KEY` is admin-only.** Only `src/lib/supabase/admin.ts` may use it, and only from `/api/admin/*` routes, each of which calls `isAdmin()` before touching it. Never import the admin client into a public route or a client component.
3. **Review is admin-gated, not community-voted.** Unlike a crowd-map, there is no upvote/downvote threshold — see `soul.md` for why (safety-critical data for drivers in an emergency). Do not add a voting system.
4. **Status transitions are one-way.** `pending → approved` or `pending → rejected`. Both are terminal. Do not add "un-reject" or "re-review" routes — re-review happens by editing the DB directly, keeping the audit trail (`reviewed_at`) honest.
5. **`workshops` and `workshop_submissions` are shared tables.** Any schema change needs a migration compatible with what `../tambalban` (Android, Kotlin) already reads/writes. Never rename or drop a column the Android app depends on without coordinating both repos.
6. **Indonesia bounds validation.** Latitude -11.0 to 6.0, longitude 95.0 to 141.0, enforced in `submissionSchema` (`src/lib/validation.ts`). Reject out-of-bounds submissions at the API layer.
7. **OpenStreetMap only.** No Google Maps, no Mapbox. Nominatim requests must go through `/api/geocode` (it sets the required `User-Agent` a browser can't, and rate-limits per IP).
8. **Rate limiting on public write/geocode routes.** `src/lib/rate-limit.ts` is in-memory, per-instance — fine for a single-region deploy. If this ever runs multi-region, swap it (don't just remove it).
9. **No PostGIS.** `workshops` uses plain lat/lng column comparisons against `idx_workshops_location`. Don't introduce PostGIS here unless the Android app's schema adopts it first (keep both apps' query patterns consistent).

---

## Code Style Rules

- TypeScript strict mode, no `any` without a `// TODO: type properly` comment.
- Tailwind CSS only — no CSS modules, no inline style objects.
- Server components by default; `"use client"` only for Leaflet, form state, or browser APIs.
- Named exports except `page.tsx`/`route.ts`, which Next.js requires default/named-by-convention.
- File naming: kebab-case (`site-header.tsx`, not `SiteHeader.tsx`).
- API routes validate with Zod first, return early on failure (see any file in `src/app/api/`).
- Supabase queries go through `src/lib/geo.ts` or route handlers using `src/lib/supabase/client.ts` / `admin.ts` — never construct a Supabase client inline elsewhere.

---

## What NOT to Do

- Do NOT add Supabase Auth, NextAuth, or per-user accounts — admin access is a single shared password by design.
- Do NOT add paid map tile providers or paid geocoding.
- Do NOT let `/api/workshops` (or any public route) read `workshop_submissions`.
- Do NOT bypass `isAdmin()` on an `/api/admin/*` route, even temporarily.
- Do NOT add a community voting/threshold system — that's `../peta-koperasi`'s model, not this one.
- Do NOT install heavy dependencies without justification.

---

## Testing

No test framework is configured yet (`package.json` has no `test` script). Before adding non-trivial logic to `src/lib/` (especially `validation.ts` or the review state machine in the `[id]/route.ts` handler), set up Vitest and test it — don't let untested Zod schemas or approve/reject logic ship silently. Follow `../peta-koperasi/vitest.config.ts` as a reference if useful.

---

## Key File Locations

| What | Where |
|------|-------|
| Project philosophy | `soul.md` |
| Full technical spec | `SPEC.md` |
| Shared Android app (same Supabase project) | `../tambalban` |
| DB schema (Android-owned) | `../tambalban/supabase_schema.sql` |
| This repo's migration | `supabase/migrations/001_web_submission_fields.sql` |
| API routes | `src/app/api/` |
| Shared types | `src/types/index.ts` |
| Supabase clients | `src/lib/supabase/` |
| Geo query helpers | `src/lib/geo.ts` |
| Validation schemas | `src/lib/validation.ts` |
| Admin auth | `src/lib/auth.ts` |

---

@AGENTS.md
