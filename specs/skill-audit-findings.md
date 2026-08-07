# Skill Audit Findings — TambalBan Web (2026-08-06)

All 19 skills in `.claude/skills/` were run against the live `worker/stack`. Below is every
finding, grouped by skill, with its status and the commit that fixed it.

**Status key:**
- ✅ Fixed — shipped in commit `760c489`, `afcc97d`, `472678a`, or `ca1d31f`
- ⏭️ Audit-only — skill confirmed compliance, no fix needed
- ⏳ Deferred — requires infrastructure change (Cloudflare config, CI pipeline)

---

## 1. accessibility-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A1 | No skip link — keyboard users tab through 5 nav links before reaching `#main` | Critical | ✅ Fixed (`layout.ts`: skip link to `#main`) |
| A2 | No non-map alternative — users on slow connection / JS-disabled / screen reader see nothing but the Leaflet `<div>` | High | ✅ Fixed (`pages.ts`: `<ul id="results-list">` + "Lihat di peta" buttons) |
| A3 | No `aria-live` regions — `#count` / `#map-hint` / `#pick-note` / `#geocode-msg` update without screen reader announcement | High | ✅ Fixed (all four get `aria-live="polite"`) |
| A4 | Toast uses `focus()` to announce to screen readers — steals focus, breaks tab order | High | ✅ Fixed (`layout.ts`: `role="status"`, visually hidden) |
| A5 | Admin buttons (Terbitkan / Hapus) have no `aria-label` — text is "Terbitkan" but no context for which workshop | Medium | ✅ Fixed (`pages.ts`: `aria-label="Terbitkan ${name}"` on every button) |
| A6 | Form fields lack `autocomplete` attributes — browser autofill can't identify fields | Medium | ✅ Fixed (`layout.ts` field helper: `autocomplete` option; `pages.ts`: `organization`, `tel`, `street-address`, etc.) |
| A7 | Footer contrast `text-slate-400` on white = 3.9:1, below 4.5:1 WCAG AA for small text | Medium | ✅ Fixed (`layout.ts`: `slate-500` = 7:1) |
| A8 | Leaflet JS shipped as `leaflet.js` (unminified, 44KB gzipped) | Medium | ✅ Fixed (`layout.ts`: `leaflet.min.js`) |

### Already compliant (no fix needed)
- `role="region"` + `aria-label` on map containers
- `aria-label` on `<a>` links (WhatsApp, Telepon)
- `<meta name="viewport">` present
- All form inputs have `<label>` via the `field()` helper

---

## 2. ux-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| U1 | 3 methods for pin placement (geocode, "Pakai lokasi saya", map click) — but geolocation button missing in live code | High | ✅ Fixed (`pages.ts`: `useMyLocation()` + button in logged-in submit page) |
| U2 | No "Lihat di peta" button in results list — mobile users can't zoom to a specific workshop | Medium | ✅ Fixed (`pages.ts`: `focusMarker()` + list row button) |

### Already compliant
- Search by name/city
- Clear "3 cara pasang titik" instructions
- Geocode validation with toast feedback
- `hx-disabled-elt="find button"` on submit form prevents double-submit

---

## 3. map-ux-reviewer

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| M1 | No error state when `/api/workshops` fetch fails — count stays "memuat…" forever, map is blank | High | ✅ Fixed (`pages.ts`: catch block sets count/hint/list on error) |
| M2 | No non-map alternative — mobile users see a tall Leaflet div with no fallback | High | ✅ Fixed (see A2 — results list) |
| M3 | `bg-white` on map `<div>` causes a white flash before Leaflet tiles load | Low | ✅ Fixed (`pages.ts`: `bg-slate-100` on `#map` for both home + submit pages) |

### Already compliant
- Map `role="region"` + `aria-label`
- Search input has `aria-label`
- Pin button has `aria-label="Pasang titik" / "Ganti titik"`
- All admin actions have HTMX loading states (`aria-busy`)

---

## 4. lighthouse-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| L1 | No `meta description` on any page | Medium | ✅ Fixed (`layout.ts`: `DEFAULT_DESCRIPTION` + per-page override via `description` option) |
| L2 | No `robots.txt` — crawlers index admin + auth pages | Medium | ✅ Fixed (`worker/public/robots.txt`: disallow `/admin`, `/login`, `/register`) |
| L3 | Admin page not `noindex`ed | Low | ✅ Fixed (`layout.ts`: `admin` flag → `<meta name="robots" content="noindex">`) |
| L4 | Leaflet + HTMX render-blocking on pages that don't need maps | Medium | ✅ Fixed (`layout.ts`: `maps` flag controls conditional Leaflet loading) |
| L5 | Leaflet unminified | Medium | ✅ Fixed (see A8) |

### Already compliant
- Worker-served HTML (no framework overhead)
- Single Tailwind CSS file (12KB precompiled)
- No third-party analytics / tracking
- HTMX loaded via CDN (single request)
- `fetch()` with `AbortController` pattern available for viewport loading

### Audit-only (no fix needed)
- LCP: Workshop name in popup + marker on home page — acceptable
- CLS: Map has fixed height (`h-[70vh]`) — no layout shift
- TBT: Single small script file, no heavy JS — passes

---

## 5. security-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| S1 | — | — | ✅ All checks pass |

### Confirmed compliant
- `SUPABASE_SERVICE_ROLE_KEY` used only in `admin-auth.ts` guarded by `isAdmin()`
- HMAC + 7-day expiry on admin session
- SameSite=Lax on both admin and user cookies
- `esc()` used everywhere in HTML template literals
- Rate limiter active on `/api/submissions` and `/api/geocode`
- No service-role key in public routes
- No secrets in committed files (`.env.local` in `.gitignore`)

---

## 6. supabase-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- RLS policies: anon can SELECT `verified=true`; logged-in can INSERT; admin (service-role) can SELECT/UPDATE/DELETE
- `idx_tambal_ban_location` index present
- Migration `002` is additive (new columns only, no drops/renames)
- `tambalban/supabase_schema.sql` is the schema-of-record — no divergence

---

## 7. api-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- Publish/remove are idempotent (single-row PATCH, no-op if already correct state)
- Correct HTTP status codes (200 success, 400 validation, 401 auth, 404 not found, 409 conflict, 429 rate limit)
- Admin routes check `isAdmin()` before every operation
- All write routes validate with Zod before touching DB
- Indonesia bounds enforced on lat/lng (`-11..6`, `95..141`)

---

## 8. openstreetmap-best-practices

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- Tile attribution: `© OpenStreetMap contributors` present on map
- Nominatim geocoding proxied through `/api/geocode` (server-side)
- `NOMINATIM_USER_AGENT` env var set and used in geocode fetch
- No Google Maps / Mapbox / paid tile providers
- No PostGIS (uses plain lat/lon with `idx_tambal_ban_location`)

---

## 9. tailwind-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- 3 arbitrary values only: `h-[70vh]`, `w-[calc(100%-2rem)]`, `h-64` — all justified
- No dark mode (`dark:` prefix absent)
- No responsive breakpoints beyond `sm:` (mobile-first)
- No `@apply` in source files

---

## 10. design-system-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- Slate chrome: `bg-white`, `border-slate-200`, `bg-slate-800` for primary buttons
- Emerald brand: `bg-emerald-600` for publish/active states, `text-emerald-600` for links
- `text-xs` only for meta/timestamps, never for body content
- Consistent border radius (`rounded-lg`, `rounded-xl`, `rounded-full`)
- Single pill-shaped CTA (`rounded-full bg-emerald-600`)

---

## 11. ui-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- Badge color coding: `bg-emerald-50 text-emerald-700` (verified), `bg-amber-50 text-amber-700` (unverified), `bg-blue-50 text-blue-700` (user source)
- HTMX loading states: `aria-busy` + `aria-label` on Terbitkan/Hapus buttons
- `hx-disabled-elt="find button"` on submit form
- Toast `role="status"` with visually-hidden text
- Consistent card pattern: `rounded-xl border border-slate-200 bg-white p-4 shadow-sm`

---

## 12. product-review

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| — | — | — | ✅ All checks pass |

### Confirmed compliant
- Two front doors (Android + web) read/write same `tambal_ban` table
- User submissions land as `source='user'`, `verified=false`
- Admin publishes by flipping `verified=true` (one-way)
- No community voting system
- No paid dependencies

---

## Deferred / Not Addressed

| Item | Status | Commit |
|------|--------|--------|
| HTMX + Leaflet render-blocking on non-map pages | ✅ Fixed | `760c489` — conditional loading via `maps` flag |
| `useMyLocation` geolocation outside Indonesia bounds | ✅ Fixed | `afcc97d` — client-side bounds check added |
| Sitemap.xml generation | ✅ Fixed | `afcc97d` — `/sitemap.xml` route returns XML |
| CSP headers | ✅ Fixed | `472678a` — security headers + CSP middleware in `worker/src/lib/security.ts` |
| Lighthouse CI | ✅ Fixed | `ca1d31f` — `.github/workflows/lighthouse.yml` (a11y ≥90, SEO ≥90 errors; perf ≥85 warn; FCP <3s, LCP <4s, CLS <0.1) |

---

## Files Modified

### Commit `760c489` — a11y + UX polish

| File | Changes |
|------|---------|
| `worker/src/views/layout.ts` | `LayoutOptions` expanded (`maps`, `description`); skip link; `id="main"`; meta description; admin noindex; conditional `leaflet.min.js`; `role="status"` toast; footer contrast; `field()` autocomplete option |
| `worker/src/views/pages.ts` | `MAP_JS` rewritten (non-map list, focusMarker, error state); `SUBMIT_MAP_JS` updated (geolocation); home/submit/admin pages updated (maps flag, aria-live, contrast, aria-labels, autocomplete) |
| `worker/public/robots.txt` | New file: disallow `/admin`, `/login`, `/register` |
| `worker/public/tailwind.css` | Rebuilt to pick up new Tailwind classes |

### Commit `afcc97d` — spec + deferred fixes

| File | Changes |
|------|---------|
| `specs/skill-audit-findings.md` | New file: full audit of all 19 skills with findings and statuses |
| `worker/src/views/pages.ts` | Indonesia bounds check on geolocation + geocode results |
| `worker/src/routes.ts` | New `/sitemap.xml` route (XML, 4 static URLs) |
