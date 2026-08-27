# API Reference

> **Stability:** Routes may change between releases until v1.0 is tagged. There is no API
> versioning. All routes are under `/api/`.
> This API is shared infrastructure with the [`../tambalban`](../../tambalban) Android app —
> both read/write the same Supabase project (`tambal_ban` table). Coordinate schema changes
> across both repos before relying on a new field here.

## Authentication

Two mechanisms, by design — never mixed, never a third added:

1. **Contributors** (register/login/submit/upload): Supabase Auth. A logged-in user's access
   token rides in the HttpOnly `tb_access_token` cookie and is sent as `Authorization: Bearer`
   on writes. Same user store as the Android app — a web account works in the app and vice versa.
2. **Admins** (`/api/admin/*`): a single shared `ADMIN_PASSWORD`, exchanged via
   `POST /api/admin/login` for an HMAC-signed session cookie (`tb_admin_session`). Not a
   per-user role — one password for whoever reviews submissions.

## Base URL

- Local development: `http://localhost:8787` (wrangler dev)
- Production: `https://tambalban-web.antsf.workers.dev`

---

## Endpoints

### GET /api/workshops

Public. Returns **verified** workshops only, either within a map viewport or by name/city search.
Never returns `verified=false` rows — that filter is unconditional.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Matched against `name`/`city` (`ilike`), max 200 chars |
| `minLat`, `maxLat`, `minLng`, `maxLng` | number | No | Viewport bounds — all four must be present together, or the query runs with no bbox at all |

**Example Request:**
```
GET /api/workshops?minLat=-6.3&maxLat=-6.1&minLng=106.7&maxLng=106.9&search=budi
```

**Example Response (200):**
```json
[
  {
    "id": "8f14e45f-ceea-4d81-b8b7-1c1b6a0b2c3d",
    "name": "Tambal Ban 24 Jam Pak Slamet",
    "lat": -6.3728,
    "lon": 106.8317,
    "address": "Jl. Raya Bogor KM 25",
    "city": "Depok",
    "province": "Jawa Barat",
    "district": "Cimanggis",
    "phone": "081298765432",
    "whatsapp": "081298765432",
    "website": null,
    "instagram": null,
    "opening_hours": "24 jam",
    "image_url": null,
    "source": "user",
    "verified": true,
    "verified_at": "2026-08-10T03:12:00.000Z",
    "motorcycle_tyres": true,
    "car_tyres": true,
    "truck_tyres": false,
    "tubeless_repair": true,
    "vulcanizer": false,
    "balancing": false,
    "spooring": false,
    "roadside_service": false,
    "created_at": "2026-08-09T20:04:11.000Z",
    "updated_at": "2026-08-10T03:12:00.000Z"
  }
]
```

Response is a **bare array** — there is no `{ data }` envelope.

**Error Responses:**
| Status | Reason |
|--------|--------|
| 400 | `{ "error": "Parameter tidak valid" }` — malformed bbox (e.g. `minLat > maxLat`) |
| 502 | `{ "error": "Gagal memuat data" }` — Supabase read failed |

**Side effects:** None (read-only).

---

### GET /api/geocode

Public, rate-limited. Proxies OpenStreetMap Nominatim so the browser never calls it directly
(Nominatim requires a custom `User-Agent` a browser can't set, and per-IP rate limiting is
enforced here, not on the client).

**Rate limit:** 10 requests / 60 seconds / IP. Exceeding it returns 429 before any upstream call.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Free-text query, 3-200 chars. Forced `countrycodes=id`, capped at 5 results server-side. |

**Example Request:**
```
GET /api/geocode?q=Jalan+Sudirman+Jakarta
```

**Example Response (200):**
```json
[
  { "lat": -6.2088, "lon": 106.8456, "display_name": "Jalan Sudirman, Jakarta Pusat, DKI Jakarta, Indonesia" }
]
```

**Error Responses:**
| Status | Reason |
|--------|--------|
| 400 | `{ "error": "Parameter tidak valid" }` — `q` missing or under 3 chars |
| 429 | `{ "error": "Terlalu banyak permintaan" }` — rate limit exceeded |
| 502 | `{ "error": "Gagal geocode" }` — Nominatim unreachable or errored |

**Side effects:** None.

---

### POST /api/auth/register

Public. Creates a contributor account via Supabase Auth — the **same user store the Android
app uses**.

**Content-Type:** `application/json`

**Request Body:**
| Field | Type | Constraints |
|---|---|---|
| `email` | string | valid email, max 254 chars |
| `password` | string | min 8, max 200 chars |

**Example Request:**
```json
POST /api/auth/register
{ "email": "budi@example.com", "password": "sandiaman123" }
```

**Response:** **HTML fragment** (HTMX `#toast` target), not JSON.
- On success with immediate session: 200, sets `tb_access_token` cookie, `HX-Redirect: /submit`.
- On success requiring email confirmation: 200, `HX-Redirect: /login?registered=1`.
- On failure: 400, HTML error toast (e.g. `"Format email tidak valid"` or the Supabase Auth error text).

**Side effects:** Creates a row in `auth.users` (shared with the Android app).

---

### POST /api/auth/login

Public. Logs in an existing contributor.

**Content-Type:** `application/json`

**Request Body:** same shape as register — `{ "email": string, "password": string }`.

**Response:** HTML fragment.
- Success: 200, sets `tb_access_token` cookie, `HX-Redirect: /submit`.
- Failure: 400, HTML error toast (`"Email/password salah"` or the Zod message).

**Side effects:** None beyond the cookie.

---

### POST /api/auth/logout

Public (no auth required to call). Clears the contributor session.

**Request Body:** none.

**Response:** 200, empty body, clears `tb_access_token`, `HX-Redirect: /`.

A `GET /api/auth/logout` variant also exists for plain-link logout — same cookie-clear effect, responds with a redirect instead of an HTMX header.

---

### POST /api/upload

Contributor-only (requires `tb_access_token`), rate-limited. Uploads a workshop photo, resizes
it server-side, and stores it in the shared `workshops` Supabase Storage bucket.

**Rate limit:** 10 requests / 60 seconds / IP.

**Content-Type:** `multipart/form-data`

**Request Body:**
| Field | Type | Constraints |
|---|---|---|
| `file` | file | `image/jpeg`, `image/png`, or `image/webp`; max 5MB before resize |

Server-side: the image is downscaled so its longest edge is at most 1600px and re-encoded to
WebP before upload — the stored file is always smaller than the original.

**Example Request:**
```
POST /api/upload
Content-Type: multipart/form-data; boundary=...

--...
Content-Disposition: form-data; name="file"; filename="bengkel.jpg"
Content-Type: image/jpeg

<binary>
--...--
```

**Example Response (200):**
```json
{ "url": "https://xwqckmkjciptlbopmxjl.supabase.co/storage/v1/object/public/workshops/3f9c1a2e.webp" }
```

**Error Responses:**
| Status | Reason |
|--------|--------|
| 400 | `{ "error": "Invalid content type" }` / `{ "error": "No file" }` / `{ "error": "Format tidak didukung. Gunakan JPG, PNG, atau WebP." }` / `{ "error": "Ukuran maksimal 5MB." }` / `{ "error": "Gambar tidak valid atau rusak..." }` |
| 401 | `{ "error": "Harus masuk" }` — no contributor session |
| 429 | `{ "error": "Terlalu banyak permintaan" }` |
| 500 | `{ "error": "Gagal mengunggah foto. Coba lagi nanti." }` — Storage upload failed (message is opaque, not the raw Supabase error) |

**Side effects:** Writes a file to the `workshops` Storage bucket. The returned URL is meant to
be submitted as `image_url` in a subsequent `POST /api/submissions` call — uploading a photo does
not by itself attach it to any workshop.

---

### POST /api/submissions

Contributor-only, rate-limited. Submits a new workshop for admin review. Lands in `tambal_ban`
with `source='user'`, `verified=false` — **invisible to the public** until an admin publishes it.

**Rate limit:** 5 requests / 60 seconds / IP.

**Content-Type:** `application/json`

**Request Body:**
| Field | Type | Constraints |
|---|---|---|
| `name` | string | required, 2-200 chars |
| `lat`, `lon` | number | required, **Indonesia bounds**: lat -11..6, lon 95..141 |
| `address`, `city`, `province`, `district`, `phone`, `whatsapp`, `website`, `instagram`, `opening_hours` | string | optional |
| `image_url` | string | optional, must be an http(s) URL |
| `motorcycle_tyres`, `car_tyres`, `truck_tyres`, `tubeless_repair`, `vulcanizer`, `balancing`, `spooring`, `roadside_service` | boolean | optional, default `false` |

`website` and `image_url` are rejected if they aren't plain `http://`/`https://` URLs (e.g. a
`javascript:` URI is rejected at this validation step, before it ever reaches the database).

**Example Request:**
```json
POST /api/submissions
{
  "name": "Tambal Ban Jaya Motor",
  "lat": -6.9147,
  "lon": 107.6098,
  "city": "Bandung",
  "phone": "081234567890",
  "opening_hours": "07:00-21:00",
  "motorcycle_tyres": true,
  "tubeless_repair": true
}
```

**Response:** HTML fragment.
- Success: 200, `HX-Redirect: /?submitted=1`, success toast stating the submission is queued
  for admin review.
- Failure: HTML error toast.

**Error Responses:**
| Status | Reason |
|--------|--------|
| 400 | Malformed JSON, or a Zod validation failure (e.g. out-of-Indonesia coordinates, name too short) |
| 401 | `"Harus masuk dulu untuk menambah."` — no contributor session |
| 429 | `"Terlalu banyak kiriman. Coba lagi nanti."` |
| 502 | `"Gagal menyimpan kiriman. Coba lagi nanti."` — insert failed (message is opaque) |

**Side effects:** Inserts one row into `tambal_ban`. `source` and `verified` are always
server-set (`'user'`, `false`) — a client cannot override either. `user_id` is stamped by a
database trigger from the caller's JWT, never sent by the client.

---

### POST /api/admin/login

Public endpoint, rate-limited. Authenticates the shared admin password and issues a signed
session cookie.

**Rate limit:** 5 attempts / 60 seconds / IP (brute-force guard), checked before the password
comparison.

**Content-Type:** `application/json`

**Request Body:** `{ "password": string }` (1-200 chars)

**Response:** HTML fragment.
- Success: 200, sets `tb_admin_session` cookie, `HX-Redirect: /admin`.
- Failure: 401, HTML error toast `"Password salah."`.

---

### GET /api/admin/logout

Clears the admin session cookie. Does not require an active session to call.

**Response:** redirects to `/admin/login`.

---

### GET /api/admin/submissions

Admin-only. Lists unverified user submissions for the review queue.

**Auth:** requires `isAdmin()` — the route's own check is the real security boundary (the
`/admin` page's redirect to `/admin/login` is UX only, not the gate).

**Response (200):** bare array of unverified submissions (`source='user'`, `verified=false`),
oldest first:
```json
[
  {
    "id": "8f14e45f-ceea-4d81-b8b7-1c1b6a0b2c3d",
    "name": "Tambal Ban Jaya Motor",
    "lat": -6.9147,
    "lon": 107.6098,
    "address": null,
    "city": "Bandung",
    "province": null,
    "district": null,
    "phone": "081234567890",
    "whatsapp": null,
    "opening_hours": "07:00-21:00",
    "user_id": "3a1b2c3d-4e5f-6789-abcd-ef0123456789",
    "created_at": "2026-08-24T14:02:00.000Z"
  }
]
```

**Error Responses:**
| Status | Reason |
|--------|--------|
| 401 | `{ "error": "Unauthorized" }` |
| 502 | `{ "error": "Gagal memuat" }` |

**Side effects:** None. Uses the service-role key (bypasses RLS) — this is the only role that
can read `verified=false` rows.

---

### GET /api/admin/workshops

Admin-only. Filtered, paginated list of **all** `tambal_ban` rows (verified and unverified).

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `search` | string | matched against name/address/city |
| `verified` | `"true"` \| `"false"` | filter by publish state |
| `source` | `"user"` \| `"osm"` | filter by provenance |
| `limit` | number | 1-500, default 100 |
| `offset` | number | default 0 |

**Response:** an **HTML list fragment** (consumed by the `#data-list` HTMX swap), not JSON.

**Error Responses:**
| Status | Reason |
|---|---|
| 401 | `{ "error": "Unauthorized" }` |
| 400 | `{ "error": "Parameter tidak valid" }` |
| 502 | `{ "error": "Gagal memuat" }` |

---

### POST /api/admin/submissions/:id/publish

Admin-only. **The single public-visibility transition in the whole app.** Flips
`verified=true` and stamps `verified_at` on one `tambal_ban` row.

**Path Parameter:** `id` — must be a valid UUID; a malformed ID is rejected with 400 before any
database call.

**One-way:** this route only ever sets `verified=true`. There is no un-publish route by
design — reverting a mispublish is a direct database edit, not an API call.

**Idempotent:** re-publishing an already-published row just re-stamps `verified_at`; there is
no separate row to duplicate, so a double-click is harmless.

**Response:** 200, HTML success toast (delivered out-of-band to the page's toast region).

**Error Responses:**
| Status | Reason |
|---|---|
| 401 | `{ "error": "Unauthorized" }` |
| 400 | `{ "error": "Invalid ID" }` — `id` isn't a UUID |
| 502 | HTML error toast — the underlying update failed |

---

### POST /api/admin/submissions/:id/remove

Admin-only. Permanently deletes one `tambal_ban` row. **Destructive and irreversible through
the app** — the admin UI shows a confirm dialog before this fires.

**Path Parameter:** `id` — must be a valid UUID; malformed IDs are rejected with 400.

**Idempotent:** removing an already-removed row is a no-op (no matching row, no error).

**Response:** 200, empty body on success (the row's card removes itself from the page).

**Error Responses:** same shape as publish — 401 unauthorized, 400 invalid ID, 502 on DB failure.

---

### POST /api/admin/bulk/publish

Admin-only. Publishes multiple rows in one call — the queue's "select all" bulk action.

**Content-Type:** `application/json`

**Request Body:** `{ "ids": string[] }` — any entry that isn't a valid UUID is silently dropped
before the database call, not rejected as a whole-request error.

**Response:** HTML success toast stating how many were published, e.g. `"3 kiriman
diterbitkan."`.

**Error Responses:**
| Status | Reason |
|---|---|
| 401 | `{ "error": "Unauthorized" }` |
| 400 | `{ "error": "No IDs" }` — the list was empty, or every entry was invalid |
| 502 | HTML error toast |

---

### POST /api/admin/bulk/remove

Admin-only. Same contract as bulk publish, but deletes the given rows.

**Request Body:** `{ "ids": string[] }`

**Response:** HTML success toast, e.g. `"3 kiriman dihapus."`.

**Error Responses:** same shape as bulk publish.

---

## HTML Pages (not API, served by the same worker)

`/`, `/login`, `/register`, `/submit`, `/admin/login`, `/admin`, `/admin/data`, `/admin/users`,
`/admin/reviews`, `/workshops/:id`, `/sitemap.xml` — server-rendered HTML consumed by a browser,
reading and writing through the API routes documented above.
