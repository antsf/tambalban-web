---
name: api-doc-generator
description: Generate inline JSDoc and a standalone /docs/api.md for TambalBan Web's 7 API routes, sourced from the actual route.ts/Zod schemas rather than SPEC.md.
---

# Skill: api-doc-generator

Generate accurate, useful API documentation for TambalBan Web.

---

## Purpose

Produce API documentation that a developer can read and immediately make correct API calls without reading the source code. This covers two outputs: inline JSDoc-style comments in `route.ts` files (for contributors reading the code) and a standalone `/docs/api.md` reference file (for consumers using the API — including whoever maintains the sibling `../tambalban` Android app, since both apps share the same Supabase project).

This project has exactly 7 API routes. Document all of them thoroughly. Do not document internal implementation details, future planned endpoints, or anything that does not exist in the current codebase.

---

## When to Invoke

- A new API route is added.
- An existing route's behavior, parameters, or response shape changes.
- A contributor or integrator (including someone working on the Android app) asks how to use the API.
- A PR modifies a route handler and the inline JSDoc is stale.
- The `/docs/api.md` file does not exist yet and needs to be created.

## When NOT to Invoke

- Writing a changelog entry for an API change (use `changelog-writer`).
- Designing a new API route (use `architect` first, then come here to document it).
- Documenting internal library functions in `src/lib/` (those get standard JSDoc, not this skill's format).

---

## Inputs

Before generating documentation, gather:

1. **Which routes?** All 7, or a specific route being updated?
2. **Source files** — Read the actual `route.ts` files under `src/app/api/`. Never document from memory or SPEC.md alone — the code is the source of truth.
3. **Zod schemas** — Read `src/lib/validation.ts` for the exact field names, types, and constraints (`submissionSchema`, `boundsSchema`, `reviewActionSchema`, `loginSchema`).
4. **Type definitions** — Read `src/types/index.ts` for `Workshop`, `WorkshopSubmission`, `Bounds`, `SubmissionStatus`.
5. **Current behavior** — Verify actual error responses and status codes from the code, not from SPEC.md's description of intended behavior.

---

## Outputs

Two artifacts:

### Artifact 1: Inline JSDoc in route.ts files

Each route handler gets a JSDoc comment block directly above the exported function. Format:

```typescript
/**
 * GET /api/workshops
 *
 * Public. Two modes: viewport query (returns approved workshops within a
 * bounding box) or name search (?q=).
 *
 * @query north,south,east,west - Viewport bounds (number, -90..90 lat / -180..180 lng).
 *   All four required together. Validated by boundsSchema.
 * @query q - Name search, min 3 characters. If present, viewport params are ignored.
 *
 * @returns 200 - { workshops: Workshop[] } — capped at VIEWPORT_LIMIT (300) for
 *   viewport queries, 20 for search, ordered by rating_count desc (viewport mode only)
 * @returns 400 - { error } - Invalid/missing bounds, or query shorter than 3 chars
 *
 * @sideeffect None (read-only, reads workshops table only — never workshop_submissions)
 */
```

Keep it concise. The JSDoc is for contributors reading the code — they can see the implementation below.

### Artifact 2: /docs/api.md

A standalone Markdown file with complete request/response examples. This is for developers consuming the API — including anyone maintaining the Android app who needs to know what shape of data lands in `workshops` via the `source: "web"` path.

---

## The 7 Routes — Documentation Requirements

Route inventory (all under `src/app/api/`), per SPEC.md §4:

| # | Route | File | Auth |
|---|-------|------|------|
| 1 | `GET /api/workshops` | `workshops/route.ts` | Public |
| 2 | `POST /api/submissions` | `submissions/route.ts` | Public, rate-limited |
| 3 | `GET /api/geocode` | `geocode/route.ts` | Public, rate-limited |
| 4 | `POST /api/admin/login` | `admin/login/route.ts` | Public, rate-limited (brute-force guard) |
| 5 | `POST /api/admin/logout` | `admin/logout/route.ts` | Requires existing session cookie to matter |
| 6 | `GET /api/admin/submissions` | `admin/submissions/route.ts` | Admin (`isAdmin()`) |
| 7 | `PATCH /api/admin/submissions/[id]` | `admin/submissions/[id]/route.ts` | Admin (`isAdmin()`) |

### Route 1: GET /api/workshops

**Purpose:** Fetch approved tire-repair workshops, either within a map viewport or by name search.

**Document these specifics:**

- **Two mutually exclusive modes**, selected by which query params are present:
  - `?q=<name>` — `ilike` name search, minimum 3 characters, capped at 20 results. No ordering guarantee documented beyond "as returned by Supabase."
  - `?north=&south=&east=&west=` — viewport query via `getWorkshopsInBounds()` in `src/lib/geo.ts`, capped at `VIEWPORT_LIMIT` (300), ordered by `rating_count desc`. All four params are required together — validated by `boundsSchema` (lat -90..90, lng -180..180, plus `north > south`).
- **No PostGIS.** The viewport query is a plain `gte`/`lte` comparison against `latitude`/`longitude` columns, backed by `idx_workshops_location`. Do not describe this as a spatial/geography query. Note in the doc: this scales to the current table size; PostGIS is a future migration if `workshops` passes ~50k rows (see `src/lib/geo.ts` docstring).
- **Response shape:** `{ workshops: Workshop[] }`. Each `Workshop` has: `id`, `name`, `latitude`, `longitude`, `phone`, `address`, `open_time`, `close_time`, `is_24h`, `rating_avg`, `rating_count`, `source`, `created_at`. `rating_avg`/`rating_count` are written by the Android app only — this route never writes them.
- **No photo field.** This project has no photo upload feature. Do not document a `photo_url` field — it does not exist on `Workshop`.
- **What this route never returns:** rows from `workshop_submissions` (pending/rejected data). This route only ever queries the `workshops` table.

### Route 2: POST /api/submissions

**Purpose:** Submit a new workshop for admin review.

**Document these specifics:**

- **Content-Type:** `application/json` (not multipart — there is no file upload in this project).
- **Rate limit:** 5 requests/hour per IP, enforced by `src/lib/rate-limit.ts` (in-memory, per-instance). Exceeding it returns `429` with a `Retry-After` header (seconds).
- **Request body fields** (per `submissionSchema` in `src/lib/validation.ts`): `name` (string, 3-120 chars), `phone` (string, 7-25 chars, `^[0-9+\-\s()]+$`), `address` (string, 10-300 chars), `latitude`/`longitude` (Indonesia bounds: lat -11..6, lng 95..141), `is_24h` (boolean, default false), `open_time`/`close_time` (nullable `HH:MM` strings, required unless `is_24h` is true — enforced by a Zod `.refine()`), `notes` (nullable string, max 500 chars).
- **Side effects:** Inserts a row into `workshop_submissions` with `status: "pending"`. Does **not** touch the public `workshops` table — that only happens later, if an admin approves.
- **Response:** `{ id: string, status: "pending" }`, HTTP 201.
- **Validation errors:** 400 with `{ error: "Data tidak valid", detail: parsed.error.issues }` (raw Zod issues array — document its shape as `ZodIssue[]`).

### Route 3: GET /api/geocode

**Purpose:** Proxy OpenStreetMap Nominatim so the browser doesn't need to set a `User-Agent` (Nominatim requires one) and lookups are cached (`revalidate: 86400`, i.e. 24h).

**Document these specifics:**

- **Rate limit:** 30 requests/minute per IP.
- **Two modes:**
  - `?lat=&lng=` — reverse geocode. Returns `{ address: string | null, detail: object | null }` where `address` is Nominatim's `display_name`.
  - `?q=<query>` — forward geocode, Indonesia-only (`countrycodes=id`), max 5 results. Returns `{ results: { label: string, latitude: number, longitude: number }[] }`.
- **Errors:** 400 if neither mode's params are valid/present; 400 if `q` is under 3 chars; 502 if the upstream Nominatim call throws (network error, non-2xx response) — document that 502 means "OpenStreetMap's geocoder is unreachable or erroring," not a bug in this API.
- **Never called directly from the browser** — always goes through this proxy. Do not document a direct Nominatim integration pattern.

### Route 4: POST /api/admin/login

**Purpose:** Authenticate the shared admin password and issue a signed session cookie.

**Document these specifics:**

- **Rate limit:** 8 attempts/15 minutes per IP (brute-force guard) — distinct from the submission/geocode limiters.
- **Request body:** `{ password: string }` (`loginSchema`).
- **On success:** sets cookie `tb_admin` (`httpOnly`, `sameSite: "lax"`, `secure` in production, 12h `maxAge`), signed HMAC-SHA256 via `ADMIN_SESSION_SECRET`. Returns `{ ok: true }`.
- **On failure:** 401 `{ error: "Password salah" }` if the password doesn't match (constant-time compared against `ADMIN_PASSWORD`); 400 if the body fails validation; 429 if rate-limited.
- **Do not document `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` values** — only that they exist as required env vars (see SPEC.md §8).

### Route 5: POST /api/admin/logout

**Purpose:** Clear the admin session cookie.

**Document:** No body required. Always returns `{ ok: true }`. Deletes the `tb_admin` cookie. Does not verify the caller is currently authenticated (deleting a cookie that doesn't exist is a no-op, not an error).

### Route 6: GET /api/admin/submissions

**Purpose:** List submissions by status for the review queue.

**Document these specifics:**

- **Admin-only:** requires a valid `tb_admin` session (`isAdmin()`). Returns 401 `{ error: "Tidak diizinkan" }` if not authenticated. Note: `src/proxy.ts` also redirects unauthenticated browser navigation to `/admin/*` toward `/admin/login`, but that is a UX convenience, not the security boundary — the route handler's own `isAdmin()` check is what actually protects the data.
- **Query parameter:** `?status=pending|approved|rejected`. Any other or missing value defaults to `pending` (silently — does not 400).
- **Response:** `{ submissions: WorkshopSubmission[] }`, newest first (`created_at desc`), capped at 200 rows. Uses the service-role client (`createAdminClient()`), so it sees all statuses regardless of RLS.

### Route 7: PATCH /api/admin/submissions/[id]

**Purpose:** Approve or reject a pending submission. **This is the core moderation action in the whole app — document it thoroughly.**

**Document these specifics:**

- **Path parameter:** `id` (UUID of the `workshop_submissions` row).
- **Admin-only:** same `isAdmin()` gate as Route 6.
- **Request body:** `{ action: "approve" | "reject" }` (`reviewActionSchema` — an enum of exactly these two strings; nothing else is valid).
- **Idempotency guard:** if the submission's current `status` is not `"pending"`, returns **409** `{ error: "Kiriman sudah di-<status>" }`. This is the mechanism that prevents a double-click (or repeat request) from approving the same submission twice or creating two `workshops` rows. Document this prominently — it is the one 409 in the whole API.
- **`action: "reject"`:** updates the submission to `status: "rejected"`, sets `reviewed_at`. Returns `{ ok: true, status: "rejected" }`.
- **`action: "approve"`:** two-step, not wrapped in a single DB transaction (see `database-review` for the atomicity discussion):
  1. Inserts a new row into `workshops` (`source: "web"`, copying name/lat/lng/phone/address/hours from the submission).
  2. Updates the submission to `status: "approved"`, `reviewed_at`, `approved_workshop_id` (FK to the new `workshops.id`).
  Returns `{ ok: true, status: "approved", workshopId: string }`.
- **Partial-failure case:** if step 1 succeeds but step 2 fails, the handler returns 500 with an explicit message naming the created `workshopId` (`"Workshop dibuat (<id>) tapi status kiriman gagal diupdate: ..."`) rather than a generic error — document this so API consumers/admins understand a 500 here may still mean a workshop was created.
- **No un-reject / re-review route exists, by design.** `approved` and `rejected` are terminal. Document this as intentional (see SPEC.md §5, CLAUDE.md rule 4) — do not imply a future `PATCH` could undo a decision.

---

## /docs/api.md Format

Use this structure for the reference file:

```markdown
# API Reference

> **Stability:** Routes may change between releases until v1.0 is tagged.
> There is no API versioning. All routes are under `/api/`.
> This API is shared infrastructure with the `../tambalban` Android app —
> both read/write the same Supabase project. Coordinate schema changes
> across both repos.

## Authentication

Public routes: none. Admin routes (`/api/admin/*`): a signed `tb_admin`
session cookie, obtained via `POST /api/admin/login` with the shared
`ADMIN_PASSWORD`. There is no per-user auth, no API keys.

## Base URL

- Local development: `http://localhost:3000`
- Production: `{deployment URL}`

---

## Endpoints

### GET /api/workshops

{purpose}

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ... | ... | ... | ... |

**Example Request:**
```
GET /api/workshops?north=-6.1&south=-6.3&east=106.9&west=106.7
```

**Example Response (200):**
```json
{
  "workshops": [
    {
      "id": "...",
      "name": "Tambal Ban Pak Budi",
      "latitude": -6.2088,
      "longitude": 106.8456,
      "phone": "081234567890",
      "address": "Jl. Sudirman No. 12, Jakarta Pusat",
      "open_time": "07:00",
      "close_time": "21:00",
      "is_24h": false,
      "rating_avg": 4.5,
      "rating_count": 12,
      "source": "android",
      "created_at": "2026-01-15T03:00:00.000Z"
    }
  ]
}
```

**Error Responses:**
| Status | Reason |
|--------|--------|
| 400 | Missing or invalid viewport parameters |

---

{repeat for each of the 7 routes}
```

**Key formatting rules for /docs/api.md:**

- Every example request must be copy-pasteable (use `curl` or plain HTTP).
- Every example response must be valid JSON.
- Every error response must include the HTTP status code and a human-readable reason (the reason strings in this codebase are Indonesian — keep example error messages in Indonesian, matching the actual code, e.g. `"Bounds tidak valid"` not an invented English translation).
- Field descriptions must include types AND constraints (not just "string" but "string, 3-120 characters").

---

## What NOT to Document

- **Internal implementation:** Do not document the exact Supabase query builder chain, or how `idx_workshops_location` is structured internally. That is source code, not API docs.
- **Session signing internals:** Do not document that HMAC-SHA256 is used or how `sign()`/`verifySessionToken()` work internally. The auth behavior is documented as behavior ("log in with the shared password, get a 12h session"), not implementation.
- **Rate limiter internals:** Document the limits (5/hour, 30/min, 8/15min) and the 429+Retry-After behavior, not that it's an in-memory `Map` (see `src/lib/rate-limit.ts` docstring on the multi-region caveat — that's an ops note, not an API contract).
- **Future endpoints:** Do not document anything from SPEC.md §10 (out of scope) — no photo upload endpoint, no data export endpoint, no voting endpoint.
- **Internal error details:** Do not expose raw Supabase error messages or stack traces as documented API contracts, even though the current code sometimes passes `error.message` straight through in a 500 response — document the status code and note "message is a raw Supabase error string, treat as opaque," rather than promising a stable error message format.

---

## Language of the Docs

This project has no i18n system — do **not** produce a bilingual doc structure like a project with `messages/id.json`/`en.json` would. `/docs/api.md` should be written in **English** for developer audience clarity (this is standard for API references), but every example error message must be copied verbatim from the actual Indonesian strings in the code (e.g. `"Terlalu banyak kiriman. Coba lagi nanti."`), since that is what a real API consumer will actually receive. Do not translate the example error strings into English — that would misrepresent the API.

---

## Thinking Process

### Step 1 — Read the source, not SPEC.md

Open each `route.ts` file. Read the actual Zod schema, the actual query, the actual response construction. SPEC.md describes intended behavior; the code is what runs. If they disagree, document the code and flag the discrepancy.

### Step 2 — Construct realistic examples

Use realistic Indonesian tire-shop data, not `"string"`:

```json
{
  "name": "Tambal Ban 24 Jam Pak Slamet",
  "phone": "081298765432",
  "address": "Jl. Raya Bogor KM 25, Cimanggis, Depok",
  "latitude": -6.3728,
  "longitude": 106.8317,
  "is_24h": true,
  "notes": "Ada di dekat SPBU, buka tubeless dan tube type"
}
```

### Step 3 — Test every error path

For each route, enumerate: missing fields? invalid types? out-of-bounds coordinates? unauthenticated admin request? re-reviewing a non-pending submission? Document every distinct error response.

### Step 4 — Verify response shapes against types

Cross-reference every documented field against `src/types/index.ts`. If `Workshop.phone` is `string | null`, document that. If `SubmissionStatus` is `"pending" | "approved" | "rejected"`, document exactly those three values — do not invent a `flagged` or `removed` state (that's peta-koperasi's voting model, not this project's).

### Step 5 — Write the inline JSDoc, then /docs/api.md

---

## Checklist for API Doc Completeness

```
[ ] All 7 routes documented (workshops GET, submissions POST, geocode GET,
    admin/login POST, admin/logout POST, admin/submissions GET, admin/submissions/[id] PATCH)
[ ] Each route has: HTTP method, path, purpose sentence, all parameters with types and constraints
[ ] Each route has: example request (copy-pasteable) and example success response (valid JSON, realistic data)
[ ] Each route has: all error responses with status codes and exact (Indonesian) reason strings from the code
[ ] Each route has: side effects documented (or "None" for read-only routes)
[ ] PATCH /api/admin/submissions/[id]: 409 idempotency guard documented with explanation
[ ] PATCH /api/admin/submissions/[id]: approve's two-step (workshop insert + submission update) and its partial-failure case documented
[ ] GET /api/workshops: viewport parameters explained, VIEWPORT_LIMIT (300) documented, no-PostGIS note included
[ ] Indonesia bounds constraint documented on POST /api/submissions
[ ] No photo_url or any photo-related field documented anywhere (this project has none)
[ ] Admin routes: session cookie mechanism documented as behavior, not implementation
[ ] Stability notice at top: "Routes may change until v1.0", shared-Supabase-project note included
[ ] No internal implementation details exposed (no query builder internals, no HMAC internals, no rate-limiter internals)
[ ] No future/planned endpoints documented
[ ] Response shapes match src/types/index.ts definitions exactly
[ ] Field constraints match src/lib/validation.ts Zod schemas exactly
[ ] Inline JSDoc added to each route.ts file
[ ] /docs/api.md file created or updated
```

---

## Integration with Other Skills

| Condition | Invoke |
|-----------|--------|
| New route added | `architect` for design review, then this skill to document |
| Route behavior changed | This skill to update both JSDoc and /docs/api.md |
| Validation schema changed | Re-verify constraints in docs match new Zod schema |
| New feature shipped | `changelog-writer` for the changelog entry |

---

## Exit Criteria

API documentation is complete when:

1. All 7 routes are documented in both inline JSDoc and `/docs/api.md`.
2. Every parameter, response field, and error code is documented with types and constraints.
3. Every example request is copy-pasteable and every example response is valid JSON.
4. The approve/reject route's 409 guard and two-step approve flow are both explicitly documented.
5. No `workshop_submissions` data is described as reachable through `GET /api/workshops`.
6. The viewport parameter semantics and 300-row cap are documented, with an explicit no-PostGIS note.
7. No internal implementation details are exposed.
8. The checklist above is fully checked.
9. Documentation has been verified against the current source code, not written from memory or SPEC.md alone.

---

*API docs are a contract with the developer — including whoever is maintaining the Android app on the other end of this shared Supabase project. Every undocumented behavior is a bug they will file.*
