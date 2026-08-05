---
name: supabase-review
description: Supabase review for TambalBan Web — cross-repo schema compatibility with the Android app, RLS policies, the anon/service-role two-client pattern, migration safety.
---

# supabase-review

Supabase-specific review for TambalBan Web.

## When to use

Run this skill when reviewing any PR or changeset that touches Supabase configuration, RLS policies, migrations, the two-client pattern (`src/lib/supabase/client.ts` / `admin.ts`), or anything that reads/writes `workshops` or `workshop_submissions`.

## Activation

Trigger: user says "supabase review", "review supabase", "RLS review", or invokes `/supabase-review`.

## Instructions

**This project's Supabase project is shared with the TambalBan Android app (`../tambalban`).** That is the single most important fact for this review skill: `workshops` and `workshop_submissions` are not this repo's tables to redesign freely — they're owned, schema-wise, by `../tambalban/supabase_schema.sql`, and this repo's only migration (`supabase/migrations/001_web_submission_fields.sql`) *extends* `workshop_submissions` with columns the web review flow needs, rather than defining the tables from scratch.

There is **no PostGIS** in this project (`CLAUDE.md` rule 9) — `workshops` uses plain lat/lng column comparisons against `idx_workshops_location`, revisit only if the table passes ~50k rows AND the Android app's schema adopts PostGIS too.

There is a real two-client pattern, but it's asymmetric from a fully-anonymous project: the anon client (`src/lib/supabase/client.ts`) is used for public reads/writes; the service-role client (`src/lib/supabase/admin.ts`, via `createAdminClient()`) is gated not just by "server-side only" but specifically by `isAdmin()` — the password-based admin auth. See `security-review` for the auth half of this; this skill focuses on the data/schema half.

Work through each section below in order.

---

### 1. Cross-Repo Schema Compatibility (the check unique to this project)

Before reviewing anything else, if the PR touches `workshops` or `workshop_submissions`:

1. Read `../tambalban/supabase_schema.sql` (the Android app's schema-owning file) and `../tambalban/CLAUDE.md`.
2. Check whether the PR renames, drops, or changes the type of any column the Android app reads or writes:

**`workshops` columns per `SPEC.md` §3.1** (shared, read-only from this app except on approve):
`id, name, latitude, longitude, phone, address, open_time, close_time, is_24h, rating_avg, rating_count, source, created_at`

Note specifically: `rating_avg`/`rating_count` are "written by the Android app, never by this site" — if any PR in this repo writes to those columns, flag it as **CRITICAL**, it's a layering violation even if technically permitted by RLS/the service-role key.

**`workshop_submissions` columns per `SPEC.md` §3.2** (this site's writes, plus the Android app's own submit flow):
`id, name, phone, address, latitude, longitude, is_24h, open_time, close_time, notes*, status, reviewed_at*, approved_workshop_id*, created_at` (columns marked `*` were added by this repo's migration `001_web_submission_fields.sql` — they did not originally exist in the Android app's schema).

3. If the PR adds a new migration file, confirm it only *extends* `workshop_submissions` (or, in principle, `workshops`) in a way both apps can tolerate — new nullable columns are safe; renaming/dropping/retyping an existing column is not safe without Android-side coordination.

Flag if:
- A column the Android app depends on is renamed or dropped without a documented cross-repo coordination plan — **CRITICAL**
- This repo writes to `rating_avg`/`rating_count` (Android-owned columns) — **CRITICAL**
- A new migration recreates/duplicates table definitions instead of extending the existing Android-owned schema — **WARNING**, likely indicates the migration wasn't written against the actual current schema

---

### 2. RLS Policy Review

Read `supabase/migrations/001_web_submission_fields.sql` and (if accessible) the Android app's schema for the base RLS policies — this repo does not own the initial `CREATE TABLE`/RLS setup.

Per `SPEC.md` §3.2: *"RLS on `workshop_submissions` already allows public INSERT + SELECT (set up by the Android app's schema)."*

Expected policy shape:

| Table | Operation | Who | Notes |
|-------|-----------|-----|-------|
| `workshop_submissions` | INSERT | anon | Public submission — required for `/api/submissions` |
| `workshop_submissions` | SELECT | anon | Set up by the Android app's schema (its own submit flow may read this) — **this repo's public routes must never rely on or expose this for pending/rejected data**, see §3 |
| `workshop_submissions` | UPDATE/DELETE | none for anon; admin routes bypass RLS entirely via the service-role client | |
| `workshops` | SELECT | anon | Public map reads |
| `workshops` | INSERT | service_role only (via this repo's admin approve action) or the Android app's own flows | This repo's anon client should never insert into `workshops` directly |
| `workshops` | UPDATE | Android app only (ratings) — this repo doesn't and shouldn't update `workshops` at all currently | |

**Verification approach (describe, don't run):** using the anon key, attempt an INSERT into `workshops` directly — it should fail or at minimum not be something this repo's code path does. Document this as a test a contributor could run to verify the boundary holds.

Flag if:
- Anon key can INSERT/UPDATE `workshops` and the application code exercises that path outside the admin approve flow — **CRITICAL**
- `workshop_submissions` SELECT via anon is somehow exposed through a public API route in this repo (see §3) — **CRITICAL**

---

### 3. The Application-Level Enforcement of "Submissions Invisible Until Approved"

This is `CLAUDE.md` rule 1, and it's enforced at the **application** layer (route selection), not by RLS alone — since `SPEC.md` notes `workshop_submissions` already has a public SELECT policy from the Android app's schema. That means the real guarantee here is: **`/api/workshops` (`src/app/api/workshops/route.ts`) must only ever query `workshops`, never `workshop_submissions`.**

```typescript
// src/app/api/workshops/route.ts — correct, only ever touches getWorkshopsInBounds/searchWorkshopsByName
// which both query "workshops" (src/lib/geo.ts), never "workshop_submissions"
```

Review actions:
- [ ] Confirm `src/lib/geo.ts`'s `getWorkshopsInBounds` and `searchWorkshopsByName` query `.from("workshops")`, never `.from("workshop_submissions")`.
- [ ] Confirm no new public route queries `workshop_submissions` directly.
- [ ] Confirm the only reads of `workshop_submissions` in this codebase are inside `/api/admin/*` routes, gated by `isAdmin()`.

Flag if: any code reachable without `isAdmin()` reads `workshop_submissions` — **CRITICAL**, this is the core data-integrity guarantee of the whole review model.

---

### 4. The Two-Client Pattern

Read `src/lib/supabase/client.ts` and `src/lib/supabase/admin.ts`.

**`client.ts`** must:
- Use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
- Never reference `SUPABASE_SERVICE_ROLE_KEY`.
- Its module comment already documents the constraint: *"Never use this to write into `workshops`."* Confirm no code path violates that (only the admin approve flow, via the admin client, writes to `workshops`).

**`admin.ts`** (`createAdminClient()`) must:
- Use `SUPABASE_SERVICE_ROLE_KEY`, via `createClient()` called fresh (it's a function, not a module-level singleton — confirm this stays intentional, since it means the client is constructed per-call rather than reused, which is fine at this project's scale).
- Only be imported inside `src/app/api/admin/*` route handlers.
- Never be imported by any client component, page component, or layout.
- Marked `"server-only"` at the top of the file — confirm this import guard is still present; it causes a build-time error if accidentally imported into client code, which is a valuable extra safety net beyond code review alone.

**Trace imports:** search the entire `src/` tree for imports of `src/lib/supabase/admin.ts`. Every importing file must be inside `src/app/api/admin/`. Flag any exception as **CRITICAL**.

Search for any file inside `src/app/api/admin/` that imports `client.ts` (the anon client) instead of `admin.ts` — this would mean an admin route is subject to RLS restrictions it shouldn't be, likely causing confusing failures rather than a security hole, but still worth flagging as **WARNING** (logic bug, not a vulnerability).

---

### 5. No Storage Buckets in This Project

Unlike a project with photo uploads, TambalBan Web has **no Supabase Storage usage** — no photo upload feature exists (`SPEC.md` §10, explicitly out of scope for v1). If a PR introduces a storage bucket, treat it as a new feature requiring `roadmap-planner` and `security-review` sign-off (file size limits, MIME validation, path generation, moderation-before-display), not something to review as a routine schema change.

---

### 6. Migration Review

Read `supabase/migrations/001_web_submission_fields.sql` (and any new migrations).

A good migration in this project:
- Is idempotent where possible (`ADD COLUMN IF NOT EXISTS`, etc.).
- Only extends the Android-owned `workshop_submissions`/`workshops` tables — never redefines them from scratch (that would risk dropping/recreating a table the Android app is actively using).
- Adds nullable columns or columns with sensible defaults, so existing Android-app-created rows (which predate this repo's fields, e.g. `notes`, `reviewed_at`, `approved_workshop_id`) don't break.
- Does not touch PostGIS (none should exist in this project at all — see `CLAUDE.md` rule 9).
- Does not use `SET LOCAL`, prepared statements (`PREPARE`), or advisory locks — Supabase's pooled connections (PgBouncer transaction mode) don't support these reliably.

Flag if:
- A migration `DROP COLUMN`s something without a documented rollback plan and cross-repo check — **CRITICAL**
- A migration redefines `workshops`/`workshop_submissions` wholesale instead of extending — **CRITICAL**
- A migration introduces a `geography`/PostGIS column — **CRITICAL** (violates CLAUDE.md rule 9 unless this is a deliberate, coordinated, roadmap-approved change)
- `SET LOCAL`, `PREPARE`, or advisory locks appear in migration or application code — **WARNING**

---

### 7. Edge Functions vs API Routes

This project uses Next.js API routes (`src/app/api/`), not Supabase Edge Functions — consistent with keeping deployment to a single target (Vercel) and tooling contributors already know.

Flag if:
- A `supabase/functions/` directory appears (should not exist in this project).
- Any code calls `supabase.functions.invoke()` — should use `fetch('/api/...')` instead.

---

### 8. Free Tier / Scale Considerations

| Resource | Limit | This project's usage |
|----------|-------|---------------------|
| Database | 500 MB (free tier) | `workshops` + `workshop_submissions` are lightweight rows (no geography column, no photo blobs); row count is shared with the Android app's overall usage, not this repo's alone |
| Bandwidth | 2 GB/month (free tier) | This site's traffic is API responses (small JSON) + OSM tiles (tiles are served by OSM directly, not proxied through Supabase) |
| No Storage usage | N/A | See §5 — no buckets exist |

Flag if:
- Any change causes this repo to fetch/return unnecessarily large payloads from `workshops` (e.g. reverting `WORKSHOP_COLUMNS`'s explicit column list back to `select("*")`).
- Row-count/scale concerns arise — remember this is a shared table with the Android app, so "this project's" usage isn't the whole picture; check with the Android app's actual data volume if scale becomes a real question.

---

### 9. Common Supabase Mistakes to Search For

1. **Using `client.ts` (anon) inside an `/api/admin/*` route** — would cause RLS to silently block operations the admin route needs to succeed (logic bug, not a security hole, but confusing). Should use `createAdminClient()`.
2. **Using `admin.ts` (service-role) inside a public route** — bypasses RLS unnecessarily and defeats the whole point of the anon/service-role split. Should use the anon `supabase` client from `client.ts`.
3. **Forgetting to `await` a Supabase call** — the client returns a thenable; forgetting `await` silently proceeds with an unresolved promise instead of `{ data, error }`.
4. **Not checking `{ error }`.** Every Supabase call in this codebase follows the pattern:
   ```typescript
   const { data, error } = await supabase.from(...).select(...);
   if (error) { /* return a Response.json({ error: ... }, { status: 500 }) */ }
   ```
   Flag any call that destructures only `{ data }`.
5. **Using `.single()` without handling the "no rows" case.** `.single()` errors if zero or multiple rows match (`PGRST116` for zero rows). The existing pattern in `[id]/route.ts` handles this: `if (fetchError || !submission) return ... 404`. Confirm new `.single()` calls do the same.

---

### 10. Review Checklist

- [ ] Any schema change checked against `../tambalban/supabase_schema.sql` and `../tambalban/CLAUDE.md` for compatibility
- [ ] This repo never writes to `rating_avg`/`rating_count` on `workshops` (Android-owned)
- [ ] `/api/workshops` and `/api/geocode` never read `workshop_submissions`
- [ ] Only `/api/admin/*` routes read `workshop_submissions`, and only after `isAdmin()`
- [ ] `client.ts` uses anon key only; `admin.ts` uses service-role key only, guarded by `"server-only"`
- [ ] No client component or non-admin route imports `admin.ts`
- [ ] No admin route imports `client.ts` instead of `admin.ts` (logic bug check)
- [ ] No Supabase Storage bucket introduced without explicit feature review (none should exist currently)
- [ ] Migrations extend the Android-owned schema, don't redefine it; are idempotent; don't touch PostGIS
- [ ] No `supabase/functions/` Edge Functions directory
- [ ] `workshops` queries use explicit column lists (`WORKSHOP_COLUMNS`), not `select("*")`
- [ ] All Supabase calls are awaited and check `{ error }`
- [ ] All `.single()` calls handle the zero-row case

---

### 11. Exit Criteria

The review is complete when:

1. Every item in the checklist above is confirmed or has a filed finding.
2. Any schema-touching change has an explicit note on cross-repo (`../tambalban`) compatibility, not just this repo's TypeScript types.
3. All CRITICAL findings are reported with file path, line number, and fix suggestion.
4. All WARNING findings are reported with explanation of risk.
5. A summary is provided: X critical / Y warning / Z info findings.
