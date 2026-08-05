# SPEC.md — TambalBan Web

Read `../soul.md` first for project philosophy. This document is the technical spec for the
web app — the target state, plus the contract for anything added to it.

> **STATUS: MID-REWRITE (2026-08).** The web app is being rebuilt on the real shared table
> `tambal_ban` and rewritten from Next.js to a lightweight stack (HTML/CSS/JS + HTMX + Hono,
> deployed on Cloudflare Workers). The old Next.js code in `src/` still targets the retired
> `workshops`/`workshop_submissions` design and does **not** work against the live database —
> treat it as deprecated scaffolding. Everything below describes the **target state**.

---

## 1. Problem Statement

The [TambalBan Android app](../tambalban) finds nearby tire repair shops (tambal ban) for
drivers with a flat tire. Its data lives in the `tambal_ban` table and needs a steady stream
of new, accurate locations. Requiring every contributor to install an Android app is a
needless barrier: a shop owner registering their own business, or a driver who just spotted a
workshop, should be able to add it from any browser.

TambalBan Web is that second front door. It reads and writes the **same Supabase project**
and the **same `tambal_ban` table** as the Android app — there is no separate submission
queue table. Adding a workshop on the web requires the same login flow as the app, so every
submission is traceable to its author.

---

## 2. User Stories

### 2.1 Visitor (anonymous, read-only)

- As a visitor, I can open the map and see all `verified=true` rows from `tambal_ban`,
  loaded viewport-by-viewport as I pan/zoom.
- As a visitor, I can search workshops by name or city.
- As a visitor, I never see unverified rows — public reads filter `verified = eq.true`.

### 2.2 Contributor (logged-in, submits data)

- As a contributor, I can **register** an account (email + password) and **log in** — the
  same Supabase Auth flow the Android app uses.
- As a contributor, I can open the submit form, drop a pin (or type an address and let
  geocoding place it), fill in name/phone/address/hours, and submit.
- My submission is inserted into `tambal_ban` with `source='user'`, `verified=false` — not
  live on the public map until an admin publishes it.
- I am rate-limited so the queue can't be spammed.

### 2.3 Admin (password-gated, publishes data)

- As an admin, I log in at `/admin/login` with a shared password; a signed session cookie
  keeps me in for a bounded time.
- As an admin, I see the unverified queue (`verified=false`, `source='user'`) at `/admin`
  and can **publish** (flip `verified=true`) or **remove** each one.
- Publishing keeps `verified_at` honest; removal happens by editing the DB directly.

---

## 3. Data Model

### 3.1 Table: `tambal_ban` (THE shared table — Android + web)

Reference: `../tambalban/supabase_schema.sql`. Columns this site touches:

| Column | Type | Web role |
|---|---|---|
| id | uuid, PK | |
| name | text | required on submit |
| lat, lon | double precision | required on submit, Indonesia bounds |
| address, city, province, district | text, nullable | collected on submit |
| phone, whatsapp | text, nullable | collected on submit |
| opening_hours | text, nullable | collected on submit (raw string, "24/7" ok) |
| image_url | text, nullable | optional photo |
| source | text | `'user'` for web/app submissions, `'osm'` for imports |
| verified | boolean, default false | **visibility flag** — public reads need `true` |
| verified_at | timestamptz, nullable | set when admin publishes |
| user_id | uuid, FK → auth.users | stamped automatically by a trigger |
| osm_id, osm_tags | bigint / jsonb | OSM import provenance |
| service flags | boolean ×8 | `motorcycle_tyres`, `car_tyres`, `truck_tyres`, `tubeless_repair`, `vulcanizer`, `balancing`, `spooring`, `roadside_service` |
| created_at, updated_at | timestamptz | defaults + trigger |

RLS on `tambal_ban`:
- `public_read_verified` — SELECT where `verified`.
- `user_insert` — INSERT only for authenticated users, row must belong to the caller
  (`user_id = auth.uid()`; a BEFORE INSERT trigger fills it from the JWT, so clients don't
  need to send it).
- `user_read_own_unverified` — SELECT allows each user to see only their own unverified rows.

The web app writes with the **logged-in user's token** (anon key is not enough for INSERT).
The admin client uses the service-role key, which bypasses RLS.

---

## 4. Authentication — Supabase Auth (same as the Android app)

- Register/login use Supabase Auth (`POST /auth/v1/signup`, `POST /auth/v1/token`). This is
  the SAME user store the Android app uses — a web account works in the app and vice versa.
- A successful login yields an access token stored where the browser can attach it to the
  submit request (`Authorization: Bearer`).
- There is **no separate web user table** — `auth.users` is the source of truth.
- Admin access stays separate: a single shared `ADMIN_PASSWORD` + HMAC-signed session cookie
  scoped to `/admin/*` only. Admin is not a per-user role.

---

## 5. Target Architecture (the rewrite)

- **Stack:** Hono (server) + HTMX (interactivity) + server-rendered HTML + Tailwind CSS.
  Deploy on **Cloudflare Workers** (free tier: 100k req/day). Vanilla JS for the map.
- **Map:** Leaflet + OpenStreetMap tiles. Nominatim geocoding proxied server-side (sets the
  required `User-Agent`, rate-limits per IP) — never called from the browser directly.
- **Pages:**
  - `/` — public map reading `verified=true` rows.
  - `/login`, `/register` — Supabase Auth forms (same flow as the app).
  - `/submit` — login-required submission form → inserts `source='user'`, `verified=false`.
  - `/admin/login` — shared-password gate.
  - `/admin` — unverified queue; publish (flip `verified`) / remove.
- **Server routes** (Hono):
  - `GET /api/workshops` — viewport query + name/city search on verified rows.
  - `GET /api/geocode` — Nominatim proxy (rate-limited).
  - `POST /api/auth/login`, `POST /api/auth/register` — Supabase Auth wrapper.
  - `POST /api/submissions` — authenticated insert into `tambal_ban` (rate-limited).
  - `POST /api/admin/login`, `POST /api/admin/logout` — session cookie.
  - `GET /api/admin/submissions`, `POST /api/admin/submissions/[id]/publish` — admin-gated.
- **Validation:** every public write/geocode input validated first (Zod v4), including
  Indonesia bounds (`lat -11..6`, `lng 95..141`). Reject out-of-bounds at the API layer.
- **Rate limiting:** in-memory, per-instance (fine for single-region Cloudflare deploy).

---

## 6. Review Logic

No community voting, no status column — `verified` is the entire state machine:

```
user submit (source='user', verified=false)
   └── admin publishes -> verified=true  (verified_at = now())
   └── admin removes    -> row deleted from DB (kept honest via audit/DB history)
```

Publishing is one-way from the app's point of view: there is no "un-publish" route.
Reconsidering an already-published row happens by editing the database directly.

---

## 7. Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server + client | same project as Android app (`xwqckmkjciptlbopmxjl`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | public, RLS-scoped reads |
| `SUPABASE_SERVICE_ROLE_KEY` | admin routes only | bypasses RLS, never on the client, never commit |
| `ADMIN_PASSWORD` | admin login | constant-time compared |
| `ADMIN_SESSION_SECRET` | admin session | 32+ chars, signs the cookie |
| `NOMINATIM_USER_AGENT` | geocode proxy | optional, identifies this app to OSM |

---

## 8. Security

- `SUPABASE_SERVICE_ROLE_KEY` is touched only by admin routes, each of which verifies the
  admin session before using it. Never import the admin client into a public route or page.
- Public API never reads unverified rows — the map route always filters `verified = eq.true`.
- Anonymous INSERT into `tambal_ban` is blocked by RLS (`user_insert` requires
  `auth.role() = 'authenticated'`); the web app must send the logged-in user's token.
- Submission and geocode endpoints are rate-limited per IP.
- Indonesia bounds enforced in the submission validator.

---

## 9. Out of Scope

- No community voting — publishing is admin-only by design (see `../soul.md`).
- No role-based per-user accounts for admin — one shared password (see §4).
- No PostGIS — `tambal_ban` is small enough for plain lat/lon column comparisons
  (`idx_tambal_ban_location`); revisit if the table passes ~50k rows.
- No photo-upload UI on v1 of the rewrite (the Android app already uploads to the public
  `workshops` bucket; a web photo picker can be added later).
- No multi-region rate limiting — the in-memory limiter is per-instance.

---

## Appendix A: Indonesia Bounding Box

```
minLat: -11.0   maxLat: 6.0
minLng:  95.0   maxLng: 141.0
```

## Appendix B: OSM Import

`scripts/scrape-osm-workshops.mjs` imports Indonesian tyre-repair shops from OpenStreetMap
(Overpass: `shop=tyres`, `service:vehicle:tyres_repair=yes`, `shop=car_repair` + tyres) into
`tambal_ban` as `source='osm'`, `verified=true`, deduped on `osm_id` and name+coords.
Data © OpenStreetMap contributors (ODbL). Imports are treated as pre-verified; user
submissions are not.
