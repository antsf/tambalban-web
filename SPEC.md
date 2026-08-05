# SPEC.md — TambalBan Web

Read `../soul.md` first for project philosophy. This document is the technical spec — what exists, and the contract for anything added to it.

---

## 1. Problem Statement

The [TambalBan Android app](../tambalban) finds nearby tire repair shops (tambal ban) for drivers with a flat tire. Its data — the `workshops` table in Supabase — needs a steady stream of new, accurate locations. The Android app already has an "Add Workshop" flow, but requiring every contributor to install an Android app is a needless barrier: a shop owner registering their own business, or a driver who just spotted a workshop, should be able to do it from any browser.

TambalBan Web is that second front door. It reads and writes the same Supabase project as the Android app. It does **not** duplicate the Android app's authenticated user features (reviews, ratings, profiles) — it exists for exactly two things: showing the public map, and collecting new submissions for a human to review.

---

## 2. User Stories

### 2.1 Visitor (anonymous, read-only)

- As a visitor, I can open `/` and see a map of approved workshops, loaded viewport-by-viewport as I pan/zoom.
- As a visitor, I can search workshops by name.
- As a visitor, I never see pending or rejected submissions — only rows in `workshops`.

### 2.2 Contributor (anonymous, submits data)

- As a contributor, I can open `/submit`, drop a pin (or type an address and let geocoding place it), fill in name/phone/address/hours, and submit.
- As a contributor, I get instant feedback that my submission is `pending` — not live on the map yet.
- As a contributor, I am rate-limited (5 submissions/hour per IP) so the queue can't be spammed.

### 2.3 Admin (password-gated, reviews data)

- As an admin, I log in at `/admin/login` with a shared password; a signed session cookie keeps me in for 12 hours.
- As an admin, I see the pending queue at `/admin` and can approve or reject each submission.
- Approving copies the submission into `workshops` (source `"web"`) and marks the submission `approved` with a link to the new row.
- Rejecting marks the submission `rejected`. Neither action is available twice — a submission not in `pending` status 409s.

---

## 3. Data Model

Both tables live in the Android app's Supabase project (`supabase_schema.sql` in `../tambalban`). This repo's only migration extends `workshop_submissions` with the columns the web review flow needs.

### 3.1 Table: `workshops` (shared with Android app, read-only from this app except on approve)

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| latitude, longitude | double precision | indexed via `idx_workshops_location` |
| phone | text, nullable | |
| address | text, nullable | |
| open_time, close_time | text, nullable | `HH:MM` |
| is_24h | boolean | |
| rating_avg, rating_count | double / int | written by the Android app, never by this site |
| source | text | `"web"` for rows created via this site's admin approve |
| created_at | timestamptz | |

### 3.2 Table: `workshop_submissions` (this site's writes, plus Android app's own submit flow)

| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name, phone, address | text | required |
| latitude, longitude | double precision | required, Indonesia bounds enforced |
| is_24h | boolean | |
| open_time, close_time | text, nullable | required unless `is_24h` |
| notes | text, nullable | added by migration `001_web_submission_fields.sql` |
| status | text | `pending` \| `approved` \| `rejected` |
| reviewed_at | timestamptz, nullable | added by migration 001 |
| approved_workshop_id | uuid, nullable, FK → `workshops.id` | added by migration 001 |
| created_at | timestamptz | |

RLS on `workshop_submissions` already allows public INSERT + SELECT (set up by the Android app's schema). Admin routes use the `service_role` key, which bypasses RLS — see §9 Security.

---

## 4. API Routes (Next.js App Router)

### 4.1 `GET /api/workshops`

Public. Two modes:
- `?north=&south=&east=&west=` — viewport query via `getWorkshopsInBounds`, capped at `VIEWPORT_LIMIT` (300) rows, ordered by `rating_count desc`.
- `?q=<name>` — name search via `ilike`, min 3 chars, capped at 20 rows.

### 4.2 `POST /api/submissions`

Public, rate-limited (5/hour/IP via `src/lib/rate-limit.ts`). Validates with `submissionSchema` (Zod), inserts into `workshop_submissions` with `status: "pending"`. Returns `{ id, status }`, 201.

### 4.3 `GET /api/geocode`

Public, rate-limited (30/min/IP). Proxies OpenStreetMap Nominatim so the browser doesn't need to set a `User-Agent` (Nominatim requires one) and so lookups are cached (`revalidate: 86400`).
- `?lat=&lng=` — reverse geocode (coords → address).
- `?q=<query>` — forward geocode, Indonesia-only (`countrycodes=id`), max 5 results.

### 4.4 `POST /api/admin/login`

Checks `password` (Zod `loginSchema`) against `ADMIN_PASSWORD` via constant-time compare, issues a signed session cookie (`tb_admin`, HMAC-SHA256, 12h TTL, `httpOnly`).

### 4.5 `POST /api/admin/logout`

Clears the session cookie.

### 4.6 `GET /api/admin/submissions?status=pending|approved|rejected`

Admin-only (`isAdmin()` check). Lists submissions by status, newest first, capped at 200.

### 4.7 `PATCH /api/admin/submissions/[id]`

Admin-only. Body `{ action: "approve" | "reject" }`.
- `reject` → `status: "rejected"`, `reviewed_at` set.
- `approve` → inserts a new `workshops` row (`source: "web"`), then updates the submission to `status: "approved"`, `reviewed_at`, `approved_workshop_id`.
- A submission not currently `pending` returns 409 (guards double-click / repeat approval).

---

## 5. Review Logic

Unlike a voting-based crowd map, there is no community threshold — a human admin approves or rejects. State machine:

```
pending --approve--> approved   (creates workshops row, sets approved_workshop_id)
pending --reject-->  rejected
```

No other transitions exist. `approved` and `rejected` are terminal — the review UI does not offer re-review. If a submission needs to be reconsidered, that happens by editing the database directly, not through the app (no "un-reject" route by design — keeps the audit trail honest).

---

## 6. UI Pages & Components

### 6.1 Pages (App Router)

| Route | Purpose |
|---|---|
| `/` | Public map (`workshop-map.tsx` + `map-panel.tsx`), viewport-bounded |
| `/submit` | Public submission form (`submit-form.tsx` + `location-picker.tsx`) |
| `/admin/login` | Admin password form |
| `/admin` | Review queue (`admin-dashboard.tsx`) — gated by `src/proxy.ts` cookie-existence check, then by `isAdmin()` signature check in the route handlers |

### 6.2 Shared Components

- `site-header.tsx`, `site-footer.tsx` — layout chrome.
- `workshop-map.tsx` — Leaflet map via `react-leaflet`, fetches `/api/workshops` on viewport change.
- `location-picker.tsx` — draggable pin + address search (calls `/api/geocode`).

### 6.3 Admin-Only Components

- `admin-dashboard.tsx` — pending/approved/rejected tabs, approve/reject buttons calling `PATCH /api/admin/submissions/[id]`.

---

## 7. File Structure

```
tambalban-web/
├── src/
│   ├── app/
│   │   ├── page.tsx                          — public map
│   │   ├── submit/page.tsx                   — submission form
│   │   ├── admin/
│   │   │   ├── page.tsx                      — review queue
│   │   │   └── login/page.tsx
│   │   └── api/
│   │       ├── workshops/route.ts            — GET viewport/search
│   │       ├── submissions/route.ts          — POST new submission
│   │       ├── geocode/route.ts              — GET Nominatim proxy
│   │       └── admin/
│   │           ├── login/route.ts
│   │           ├── logout/route.ts
│   │           └── submissions/
│   │               ├── route.ts              — GET queue
│   │               └── [id]/route.ts         — PATCH approve/reject
│   ├── components/
│   │   ├── site-header.tsx, site-footer.tsx
│   │   ├── workshop-map.tsx, map-panel.tsx, location-picker.tsx
│   │   ├── submit-form.tsx
│   │   └── admin-dashboard.tsx
│   ├── lib/
│   │   ├── geo.ts                            — viewport/search queries, haversine
│   │   ├── validation.ts                     — Zod schemas, Indonesia bounds
│   │   ├── auth.ts                           — password check, session sign/verify
│   │   ├── rate-limit.ts                     — in-memory fixed-window limiter
│   │   ├── format.ts
│   │   └── supabase/
│   │       ├── client.ts                     — anon-key client (public routes)
│   │       └── admin.ts                      — service-role client (admin routes only)
│   ├── types/index.ts                        — Workshop, WorkshopSubmission, Bounds
│   └── proxy.ts                              — cheap cookie-existence gate on /admin/*
└── supabase/migrations/
    └── 001_web_submission_fields.sql         — extends workshop_submissions
```

---

## 8. Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | same project as Android app |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | public, RLS-scoped |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` only | server-only, bypasses RLS, never commit |
| `ADMIN_PASSWORD` | `src/lib/auth.ts` | plain string, constant-time compared |
| `ADMIN_SESSION_SECRET` | `src/lib/auth.ts` | 32+ chars, signs the session cookie |
| `NOMINATIM_USER_AGENT` | `src/app/api/geocode/route.ts` | optional, identifies this app to OSM |

---

## 9. Security

- `SUPABASE_SERVICE_ROLE_KEY` is touched only by `src/lib/supabase/admin.ts`; every `/api/admin/*` route calls `isAdmin()` before using it.
- Admin session cookie is `httpOnly`, HMAC-SHA256 signed, 12h TTL. `src/proxy.ts` only checks the cookie *exists* (fast redirect for anonymous visitors) — actual signature verification happens per-request in `isAdmin()`, so a forged cookie without a valid signature is rejected server-side even if it slips past the proxy.
- Public API never reads `workshop_submissions` — `/api/workshops` only ever selects from `workshops` (already-approved data).
- Indonesia bounds (`lat -11..6`, `lng 95..141`) enforced in `submissionSchema`.
- Submission and geocode endpoints are rate-limited per-IP (in-memory — see `rate-limit.ts` docstring on multi-region caveat).

---

## 10. Out of Scope for v1

- No community voting — review is admin-only by design (see `../soul.md` — accuracy over crowd speed for an emergency-use dataset).
- No user accounts on the web side (the Android app's auth is separate and unrelated to this site).
- No PostGIS — `workshops` is small enough for plain lat/lng column comparisons (`idx_workshops_location`); revisit if the table passes ~50k rows (noted in `geo.ts`).
- No photo uploads for submissions (the Android app's `AddWorkshopActivity` may add this later; not mirrored here yet).
- No multi-region rate limiting — the in-memory limiter is per-instance, adequate for a single-region deploy.

---

## Appendix A: Indonesia Bounding Box

```
minLat: -11.0   maxLat: 6.0
minLng:  95.0   maxLng: 141.0
```

## Appendix B: Submission Status Enum

`pending` → `approved` | `rejected` (terminal, no further transitions)
