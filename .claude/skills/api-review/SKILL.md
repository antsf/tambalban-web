---
name: api-review
description: Review API route handler pattern, HTTP semantics, status codes, response shapes, and the approve/reject idempotency guard for TambalBan Web's Next.js API routes.
---

# api-review

API route design and correctness review for TambalBan Web.

## When to use

Run this skill when reviewing any PR or changeset that touches API routes in `src/app/api/`, Zod schemas in `src/lib/validation.ts`, response shapes, or HTTP semantics. Also run when investigating API bugs or inconsistencies.

## Activation

Trigger: user says "api review", "review api", "route review", "endpoint review", or invokes `/api-review`.

## Instructions

You are reviewing API route correctness for a Next.js App Router site that collects tire-repair workshop data for drivers with a flat tire. There are exactly 7 routes: 3 public (`GET /api/workshops`, `POST /api/submissions`, `GET /api/geocode`), and 4 admin-gated (`POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/submissions`, `PATCH /api/admin/submissions/[id]`). Unlike a fully anonymous crowd-map, this project **does** have authentication — a single shared `ADMIN_PASSWORD` plus a signed session cookie, scoped only to `/api/admin/*`. Correctness depends on validation, consistent error shapes, proper status codes, rate limiting on public write endpoints, and the `isAdmin()` gate on every admin route.

Work through each section below in order. Read the relevant files, report findings, and flag violations.

---

### 1. Route Handler Pattern Review

Every public route handler should follow this order:

```
1. Rate limit check (public write/geocode routes only) → early return 429 with Retry-After
2. Parse request (body, params, query)
3. Validate with Zod schema → early return 400 on failure
4. Supabase query
5. Handle Supabase error → return appropriate error status
6. Return success response with correct status code
```

Admin routes additionally require, as the **very first** step before anything else touches the request:

```
0. isAdmin() check → early return 401 if not authenticated
```

**Read every route handler file under `src/app/api/`:**
- `workshops/route.ts`
- `submissions/route.ts`
- `geocode/route.ts`
- `admin/login/route.ts`
- `admin/logout/route.ts`
- `admin/submissions/route.ts`
- `admin/submissions/[id]/route.ts`

For each admin handler, verify `isAdmin()` (from `src/lib/auth.ts`) is called and checked **before** any Supabase query, including the service-role client construction (`createAdminClient()`). Flag any admin route where the service-role client is instantiated or queried before the auth check — **CRITICAL**, this is exactly the kind of ordering bug that would let an unauthenticated request read `workshop_submissions`.

For public routes, verify Zod validation happens before the Supabase query — **WARNING** if reversed (wasted DB call on invalid input).

---

### 2. HTTP Semantics

| Route | Method | Idempotent? | Side effects? |
|-------|--------|-------------|---------------|
| /api/workshops | GET | Yes | None |
| /api/submissions | POST | No | Inserts `workshop_submissions` row |
| /api/geocode | GET | Yes | None (proxies Nominatim) |
| /api/admin/login | POST | No | Sets session cookie |
| /api/admin/logout | POST | Yes (in effect) | Clears session cookie |
| /api/admin/submissions | GET | Yes | None |
| /api/admin/submissions/[id] | PATCH | No (guarded — see §5) | Updates submission, may insert `workshops` row |

**Verify:**
- No GET handler has side effects (no DB writes)
- No PUT or DELETE handlers exist anywhere in `src/app/api/` — they are not needed, this project's only mutations are submission create and admin approve/reject
- `POST /api/submissions` returns 201 on creation (it does — verify it stays that way)
- `PATCH /api/admin/submissions/[id]` is genuinely idempotent in outcome (repeat calls after the first do not create a second `workshops` row — see §5) even though the HTTP method itself doesn't guarantee that

Flag if:
- A GET handler writes to the database — **CRITICAL**
- A PUT/DELETE handler exists — **WARNING** (not in SPEC.md, may be unprotected)
- `POST /api/submissions` returns 200 instead of 201 — **INFO**

---

### 3. Response Shape Consistency

This codebase does **not** use a `{ data: T }` / `{ error: string }` envelope convention — verify you are reviewing against what actually exists, not an invented standard:

| Route | Success shape | Error shape |
|-------|---------------|-------------|
| GET /api/workshops | `{ workshops: Workshop[] }` | `{ error: string, detail?: ZodIssue[] }` |
| POST /api/submissions | `{ id: string, status: "pending" }` | `{ error: string, detail?: ZodIssue[] }` |
| GET /api/geocode | `{ address, detail }` or `{ results: [...] }` | `{ error: string }` |
| POST /api/admin/login | `{ ok: true }` | `{ error: string }` |
| POST /api/admin/logout | `{ ok: true }` | — |
| GET /api/admin/submissions | `{ submissions: WorkshopSubmission[] }` | `{ error: string }` |
| PATCH /api/admin/submissions/[id] | `{ ok: true, status, workshopId? }` | `{ error: string }` |

**Read every route handler** and check:
- Every error response uses the key `error` (string) — this is already consistent across the codebase, flag any deviation (e.g., `message` instead of `error`) as a regression
- Success shapes are per-route (not a single generic envelope) — this is intentional and fine; do not recommend collapsing them into `{ data }`, that would be an unrequested redesign, not a bug
- No route returns a bare array without a wrapper key
- No route leaks a raw Supabase response object (check that only `.message` is ever surfaced from a Supabase `error`, never the full error object with `code`/`details`/`hint`)

---

### 4. Status Code Review

| Scenario | Expected code | Where it applies |
|----------|---------------|-------------------|
| Successful GET | 200 | workshops, geocode, admin/submissions |
| Successful POST (created resource) | 201 | POST /api/submissions |
| Successful POST (no resource created) | 200 | admin/login, admin/logout |
| Validation failure (bad input) | 400 | any Zod `.safeParse()` failure, malformed JSON body |
| Unauthenticated admin request | 401 | admin/submissions, admin/submissions/[id] |
| Wrong admin password | 401 | admin/login |
| Re-reviewing a non-pending submission | 409 | PATCH /api/admin/submissions/[id] |
| Submission not found | 404 | PATCH /api/admin/submissions/[id] |
| Rate limit exceeded | 429 with `Retry-After` header | submissions, geocode, admin/login |
| Upstream Nominatim failure | 502 | GET /api/geocode |
| Supabase error / unexpected failure | 500 | any route with a DB call |

**For each route handler, verify the correct status code is returned for each applicable scenario.** In particular:
- `GET /api/admin/submissions/[id]` PATCH returns 404 when the submission `id` doesn't exist (via `fetchError || !submission`) — verify this stays a 404, not a 500 or a silent 200.
- The 409 on a non-`pending` submission is the single most important status code in this API — it is the only thing preventing double-approval creating two `workshops` rows for the same submission via a double-click or retried request. Verify it fires **before** any write, not after.
- Rate-limited routes (submissions, geocode, admin/login) return 429 with a numeric `Retry-After` header (seconds) — verify the header is present, not just the status code.

Flag if:
- Wrong status code for a scenario — **WARNING**
- 409 check happens after a write already occurred — **CRITICAL**
- Malformed JSON body (`request.json()` throwing) is not caught and returns a raw 500 instead of a clean 400 — **WARNING** (verify every POST/PATCH handler wraps `request.json()` in try/catch — they currently do; flag any new handler that skips this)
- Supabase error message passed through raw in a 500 without at least being wrapped in a clear prefix (e.g. `` `Gagal menyimpan kiriman: ${error.message}` ``) — **INFO** (current code already does this reasonably; don't demand more than this)

---

### 5. The Approve/Reject Idempotency Guard

`PATCH /api/admin/submissions/[id]` is the most consequential handler in the API — it's the only place a `workshop_submissions` row becomes a public `workshops` row. Unlike a voting-based crowd-map (no such thing here — see `crowdsourcing-review` for that distinction), correctness here means **exactly-once promotion to public data**, enforced entirely by a single admin action plus a status check, not by any vote threshold.

**Trace the full approve flow:**

```
PATCH /api/admin/submissions/[id]  { action: "approve" | "reject" }
  → isAdmin() check → 401 if not authenticated
  → Parse + validate body (reviewActionSchema: action must be exactly "approve" or "reject")
  → Fetch submission by id → 404 if not found
  → Check submission.status === "pending" → 409 if not (THE guard)
  → If reject: UPDATE workshop_submissions SET status='rejected', reviewed_at=now() → done
  → If approve:
      → INSERT INTO workshops (source: "web", ...) → 500 if this fails, nothing else happens
      → UPDATE workshop_submissions SET status='approved', reviewed_at, approved_workshop_id → 
        if THIS fails, workshop already exists but submission still shows pending/stale —
        the handler must surface the created workshopId in the error message (it does)
  → Return 200 with { ok, status, workshopId? }
```

**Verify:**
1. The `status !== "pending"` check happens **before** any INSERT/UPDATE — re-confirm by reading the actual line order in `admin/submissions/[id]/route.ts`.
2. There is no race-condition window where two concurrent PATCH requests for the same `id` could both pass the pending check before either writes (this is a real gap in the current implementation — Supabase doesn't provide a compare-and-swap `UPDATE ... WHERE status='pending'` here; flag this as **WARNING**, not CRITICAL, since it requires a genuine race — two admins clicking simultaneously — which is low-probability for a single-admin-password project, but note it as a known limitation worth an eventual `UPDATE ... WHERE id = ? AND status = 'pending'` rewrite that only proceeds if a row was actually updated).
3. `reviewActionSchema` rejects any `action` value other than the literal strings `"approve"`/`"reject"` — no case-insensitivity, no synonyms.
4. The partial-failure path (workshop created, submission update fails) is explicitly surfaced to the caller with the created `workshopId`, not swallowed — **CRITICAL** if this ever regresses to a generic error that hides the orphaned `workshops` row.

Flag if:
- The pending-status guard is missing or checked after a write — **CRITICAL**
- `action` accepts values beyond the two-item enum — **BUG**
- The race condition is present with no comment/TODO acknowledging it — **WARNING**, suggest `UPDATE ... WHERE status = 'pending'` + checking affected row count as the fix

---

### 6. Viewport Parameter Validation

`GET /api/workshops` accepts viewport bounds via `boundsSchema` in `src/lib/validation.ts`.

**Current validation rules (verify these against the actual schema, they may have changed):**
1. All four (`north`, `south`, `east`, `west`) required together — `boundsSchema` has no optional fields, so a partial set already 400s via Zod's required-field behavior. Verify this is still true.
2. Coerced to numbers via `z.coerce.number()` (query params arrive as strings) — verify NaN/non-numeric input is rejected (Zod's `coerce.number()` on `"abc"` produces `NaN`, and `.min()`/`.max()` on `NaN` fail as expected — but explicitly test this assumption, don't just assume Zod handles it silently correctly).
3. `north > south` enforced via `.refine()`. Note: `west < east` is **not** currently enforced — flag as **INFO** (this project doesn't need antimeridian handling since it's Indonesia-only, but a swapped east/west still produces a nonsensical, possibly-empty query rather than a rejected one; low priority given `VIEWPORT_LIMIT` bounds the damage).
4. There's no Indonesia-specific bounds check on the viewport params themselves (only `submissionSchema`'s lat/lng have the -11..6 / 95..141 range) — this is correct and intentional, since the viewport describes the visible map area, which is allowed to include areas the visible tiles show even if no workshops exist there. Do not flag this as missing.

**Verify the query itself:**
- `getWorkshopsInBounds()` in `src/lib/geo.ts` always applies `.limit(VIEWPORT_LIMIT)` (300) — **WARNING** if any code path calls it without a limit, since an unbounded zoomed-out query could return the entire `workshops` table as it grows.
- No PostGIS involved — this is a plain `gte`/`lte` range query against `latitude`/`longitude` columns backed by `idx_workshops_location`. Do not flag the absence of `ST_MakeEnvelope`/`ST_Within` as a bug; see `geo-data-review` for when that migration becomes necessary (~50k rows).

Flag if:
- Viewport params not validated at all — **CRITICAL**
- `south > north` not rejected — **BUG**
- `VIEWPORT_LIMIT` missing from any viewport query path — **WARNING**

---

### 7. Error Handling — Supabase Down / Unexpected Errors

When Supabase is unreachable or returns a connection error, the API route should not leak internals.

**Simulate this scenario mentally:** if `supabase.from('workshops').select(...)` returns `{ data: null, error: { message: 'connection refused', code: '...' } }`:
- Does the handler check `error`? (All current handlers do.)
- Does it return just `error.message`, or the full error object? (Should be just `.message` — verify no handler ever does `Response.json({ error })` with the raw Supabase error object, which would leak `code`/`hint`/`details`.)
- Status code: this codebase uses 500 for Supabase failures uniformly (not 503) — this is acceptable and consistent; do not demand a 503 distinction unless the team decides to add one.

**Also check for unhandled exceptions:**
- What if `request.json()` throws (malformed JSON body)? Every POST/PATCH handler in this codebase already wraps this in try/catch and returns 400 — verify any *new* handler does the same.
- What if `context.params` (the dynamic route param in `[id]/route.ts`) resolves unexpectedly? Next.js 16's async `params` (`Promise<{ id: string }>`) must be awaited — verify `await context.params` is present, not accessed synchronously (a regression here would be a build-time TypeScript error in strict mode, but double-check it's actually awaited, not just typed as a Promise and ignored).

Flag if:
- No try/catch around JSON body parsing in a POST/PATCH handler — **WARNING**
- Raw Supabase error object (not just `.message`) in a response — **WARNING**
- `context.params` not awaited — **BUG** (Next.js 16 requirement)

---

### 8. Zod Schema Review

Read all four schemas in `src/lib/validation.ts`: `submissionSchema`, `boundsSchema`, `reviewActionSchema`, `loginSchema`.

**For `submissionSchema`:**
- `name`: 3-120 chars, trimmed — verify trim happens before length check (Zod's `.trim()` in the chain does this correctly)
- `phone`: 7-25 chars, regex `^[0-9+\-\s()]+$` — verify the regex doesn't accidentally allow letters
- `address`: 10-300 chars, trimmed
- `latitude`/`longitude`: Indonesia bounds (-11..6, 95..141) — this is the load-bearing safety check per CLAUDE.md rule 6; verify it cannot be bypassed by any code path that constructs a submission outside this schema
- `is_24h`/`open_time`/`close_time`: the `.refine()` requiring either `is_24h: true` or both times present — verify the error `path` (`["open_time"]`) produces a sensible field-level error for the frontend to surface
- `notes`: optional, max 500 chars

**For `boundsSchema`:** see §6.

**For `reviewActionSchema`:** exactly `z.enum(["approve", "reject"])` — verify no other action strings are silently accepted.

**For `loginSchema`:** `password: z.string().min(1)` — intentionally minimal; the real check is `checkPassword()`'s constant-time compare in `src/lib/auth.ts`, not schema-level password strength (there's nothing to validate about a shared secret's shape).

Flag if:
- Any required field missing from a schema — **WARNING**
- A schema allows values the DB constraint (Indonesia bounds, workshop_submissions columns) would reject anyway, meaning the Zod layer isn't actually the first line of defense — **INFO**
- `reviewActionSchema` accepts values beyond the two-item enum — **BUG**

---

### 9. Review Checklist

**Handler pattern:**
- [ ] Every public route: rate limit (where applicable) → validate → query → respond
- [ ] Every admin route: `isAdmin()` is the first check, before any service-role client use
- [ ] Zod validation is the first step after parsing the request body

**HTTP semantics:**
- [ ] No GET handler has side effects
- [ ] No PUT/DELETE handlers exist
- [ ] POST /api/submissions returns 201 on creation

**Response shapes:**
- [ ] All error responses use `{ error: string }`
- [ ] No raw Supabase error objects in responses
- [ ] Success shapes match the per-route table in §3 (no invented `{ data }` envelope expected)

**Status codes:**
- [ ] 200 on successful GET / no-resource POST
- [ ] 201 on submission creation
- [ ] 400 on validation failure or malformed JSON
- [ ] 401 on missing/invalid admin session, wrong password
- [ ] 404 on submission not found
- [ ] 409 on re-reviewing a non-pending submission, checked before any write
- [ ] 429 on rate limit, with `Retry-After` header
- [ ] 502 on upstream Nominatim failure

**Approve/reject route:**
- [ ] Pending-status guard checked before any INSERT/UPDATE
- [ ] Partial-failure (workshop created, submission update fails) surfaces the workshopId, not swallowed
- [ ] Race condition between concurrent approvals is at least acknowledged (WARNING if not fixed with a conditional UPDATE)
- [ ] `action` strictly limited to `"approve" | "reject"`

**Viewport:**
- [ ] All four bounds required together
- [ ] Parsed as numbers via `z.coerce.number()`, invalid values rejected
- [ ] `south < north` validated
- [ ] `VIEWPORT_LIMIT` (300) applied on every viewport query path

**Error handling:**
- [ ] try/catch around every JSON body parse
- [ ] `context.params` awaited in dynamic routes
- [ ] Generic/wrapped error messages in responses (no raw Supabase error objects)

---

### 10. Exit Criteria

The review is complete when:

1. Every route handler under `src/app/api/` has been read and reviewed against the pattern in §1.
2. Every item in the checklist above is confirmed or has a filed finding.
3. All CRITICAL findings are reported with file path, line number, current code, and fix.
4. All WARNING findings are reported with risk and remediation.
5. The approve/reject idempotency guard (§5) has been verified end-to-end, including the race-condition discussion.
6. A summary is provided: X critical / Y warning / Z info findings.
