---
name: lighthouse-review
description: Lighthouse performance/accessibility/SEO review for TambalBan Web — LCP/INP/CLS mitigations, network payload, third-party requests, per-route target scores.
---

# lighthouse-review

Lighthouse performance and quality review for TambalBan Web — a data-collection site for tire-repair shops used by stranded drivers.

## When to use

Run this skill when reviewing performance of any page, before a release milestone, after adding new dependencies, or when investigating slow load times. Especially relevant for the map page (`/`, via `src/components/workshop-map.tsx`), which carries the heaviest client-side payload (Leaflet + react-leaflet).

## Activation

Trigger: user says "lighthouse review", "performance review", "lighthouse audit", "page speed review", or invokes `/lighthouse-review`.

## Instructions

Per `soul.md`: "A flat tire always happens at the wrong time — at night, on a toll road, somewhere the signal is weak." The primary consumer of this data is the TambalBan Android app used in exactly that moment. This website is the *second* front door, used by shop owners registering their business and by drivers/volunteers spotting a new workshop — often also on the road, on a phone, on a mediocre connection. Performance here is not abstract polish; slow load means a contributor gives up before the data ever reaches someone stranded later.

Work through each section below in order. Read the relevant files, report findings, flag violations.

---

### 1. Target Scores

| Category | General pages (`/submit`, `/admin/login`) | Map page (`/`) |
|----------|--------------------------------------------|-----------------|
| Performance | >= 85 | >= 80 (Leaflet overhead accepted) |
| Accessibility | >= 90 | >= 90 |
| Best Practices | >= 95 | >= 95 |
| SEO | >= 90 | N/A for `/admin/*` (should be noindex, see §7) |

The map page gets a discount because Leaflet is entirely client-rendered via `dynamic(() => import(...), { ssr: false })` — LCP will always involve a client-rendered element. This is inherent to interactive mapping, not an optimization failure.

---

### 2. Largest Contentful Paint (LCP)

**Mitigations to verify are in place:**

1. **Server-rendered content above/around the map.** `src/app/page.tsx` is a server component that renders the header bar ("Peta Tambal Ban" title + subtitle + "+ Tambah Tambal Ban" link) directly in server HTML — only `<MapPanel />` is a client boundary. Confirm this split hasn't regressed (e.g. someone wrapping the whole page in `"use client"`).

2. **Map container placeholder.** `src/components/map-panel.tsx`'s `loading` fallback renders a `bg-[#dcd6c8]` background with a "Memuat peta…" label while the Leaflet chunk loads — so there's no flash of empty white space and no layout shift once the real map mounts. Verify this stays in sync if `map-panel.tsx` changes.

3. **Leaflet chunk is separate.** Confirm `WorkshopMap` (and `LocationPicker` on `/submit`) are still behind `next/dynamic(..., { ssr: false })` and that `react-leaflet`/`leaflet` are not imported anywhere reachable from a server component or `layout.tsx`.

**Flag if:**
- The entire page is wrapped in `"use client"` — **CRITICAL** (nothing server-renders, LCP suffers)
- Map container placeholder has no background/label — **WARNING**
- `react-leaflet`/`leaflet` imported outside a dynamic, `ssr: false` boundary — **CRITICAL**

---

### 3. Interaction to Next Paint (INP)

The most interaction-heavy components are `submit-form.tsx` (submit button, geocode search, "pakai lokasi saya" geolocation button) and `admin-dashboard.tsx` (approve/reject buttons).

**Review:**

1. **Submit button disables while in flight.** `submit-form.tsx` tracks `submitting` state and disables the button (`disabled={submitting}`) with a label swap ("Mengirim…") — confirm this stays synchronous with the click, not gated behind the fetch resolving.
2. **Admin approve/reject disables per-row.** `admin-dashboard.tsx` tracks `busyId` and disables only the row being acted on (`disabled={busyId === s.id}`) so other rows stay usable — confirm double-click on the same row can't fire two approvals (there's also a server-side 409 guard in `PATCH /api/admin/submissions/[id]` for defense-in-depth).
3. **Geocode search is not fired on every keystroke.** `searchPlace()` in `submit-form.tsx` only runs on button click or Enter key, not on every `onChange` — this matters because `/api/geocode` is itself rate-limited (30/min/IP via `src/lib/rate-limit.ts`) and proxies to Nominatim, which asks for max ~1 req/sec.

**Flag if:**
- A button doesn't disable synchronously on click before the network call resolves — **WARNING**
- Geocode search fires on every keystroke (would burn through the rate limit fast and hammer Nominatim) — **CRITICAL**

---

### 4. Cumulative Layout Shift (CLS)

1. **Map container height.** `src/app/page.tsx` sets `h-[calc(100vh-4rem)]` on the outer flex column and `flex-1` on the map's wrapping `<div>` — height is resolved before Leaflet mounts, not computed after. Verify this hasn't been replaced with a JS-computed height.
2. **Header height.** `site-header.tsx` uses `h-16` (the `4rem` the map calc subtracts) — check it doesn't wrap on narrow viewports (the nav has two links plus a logo; confirm at 375px it stays one row or the height is still accounted for).
3. **Fonts.** `layout.tsx` uses `next/font/google` (`Geist`, `Geist_Mono`) with variable fonts — `next/font` handles `font-display` automatically, so this is generally safe by default; just confirm no additional `@font-face` was added elsewhere.
4. **Popups.** Leaflet popups are `position: absolute` overlays — should not cause layout shift by construction. Verify no custom popup reimplementation uses normal document flow.
5. **The "Memuat…"/error badge overlay in `workshop-map.tsx`** is `absolute` positioned (`absolute left-3 top-3`), so it should not push map content — confirm it hasn't been changed to flow layout.

**Flag if:**
- Map container height depends on a post-mount JS measurement — **CRITICAL**
- Header height is not fixed / wraps on mobile — **WARNING**

---

### 5. Network Payload Review

This project's dependency footprint (`package.json`) is lean by construction:

- No `leaflet.markercluster` (not installed — no clustering exists, see `leaflet-expert`).
- No FingerprintJS or any anti-fraud client library (this project uses admin-password auth + server-side rate limiting instead, not client fingerprinting — see `security-review`).
- No analytics/tracking libraries.

**Rough gzipped budget for `/`:**

| Asset | Budget |
|-------|--------|
| Next.js framework (Next 16, Turbopack build) | ~85kB |
| Leaflet + react-leaflet | ~50kB |
| App code | ~60kB |
| Tailwind v4 CSS (purged) | ~15kB |
| HTML | ~8kB |
| OSM tiles (first viewport, images not JS) | ~150-250kB depending on zoom/tile count |
| **Total JS** | **~200kB** |

**How to verify:**
1. Run `next build` and check per-route JS sizes in the output.
2. Flag any route exceeding ~300kB first-load JS.

**Flag if:**
- Total first-load JS for `/` exceeds 300kB gzipped — **WARNING**
- A dependency was added that isn't justified by `SPEC.md`/`CLAUDE.md` (check "Do NOT install heavy dependencies without justification") — **WARNING**

---

### 6. Third-Party Requests

**Nominatim (`/api/geocode`):**
- Proxied server-side through this project's own `/api/geocode` route (`src/app/api/geocode/route.ts`), never called directly from the browser — this is correct and required (Nominatim needs a `User-Agent` a browser can't set, and the server-side proxy applies rate limiting + response caching via `next: { revalidate: 86400 }`).
- Verify no code path calls `nominatim.openstreetmap.org` directly from a client component — that would bypass both the User-Agent requirement and the rate limit.

**OpenStreetMap tiles:**
- Load on demand as the viewport changes — expected. No tile preloading needed.

**No other third-party scripts should exist.** Search `layout.tsx`, `page.tsx`, and any route files for `<script>` tags. Flag any analytics, tracking, or embeds.

**Flag if:**
- Nominatim called directly from client code, bypassing `/api/geocode` — **CRITICAL** (breaks rate limiting and the required User-Agent header)
- Any analytics/tracking script found — **CRITICAL**

---

### 7. SEO Review

1. **Home page metadata.** `src/app/layout.tsx` sets a root `metadata` export with an Indonesian title ("TambalBan — Peta Tambal Ban Indonesia") and description. This is the only page needing strong SEO — it's the public discovery surface.
2. **No per-workshop detail pages exist** (no `/workshop/[id]` route in this project — the map popup carries all the detail, see `leaflet-expert`/`map-ux-reviewer`). Don't flag "missing dynamic metadata for detail pages" — there is no such route by design.
3. **`/admin` and `/admin/login` should not be indexed.** These are password-gated moderator pages with no public value in search results. Check for a `noindex` meta tag or `robots.txt` disallow rule covering `/admin`. If absent, flag it — currently nothing appears to prevent indexing of the admin login page.
4. **`robots.txt` / sitemap:** verify one exists and doesn't block `/` or `/submit` (the pages that should be discoverable) while ideally excluding `/admin/*`.

**Flag if:**
- No meta title/description on `/` — **CRITICAL**
- `/admin/login` or `/admin` is indexable — **WARNING** (not a security hole since `isAdmin()` still gates every admin API route, but there's no reason to expose the login form to search engines)

---

### 8. Accessibility Quick Check

1. **Color contrast** — the neo-brutalist palette (`src/app/globals.css` `@theme`) uses `--color-ink` (#111) text on `--color-brand` (#ffd400 yellow) or `--color-paper` (#fff7e6) backgrounds for most buttons/badges, which should pass contrast easily (dark text, light background). Watch specifically for white text on `--color-accent` (#0057ff blue) or `--color-danger` (#e4002b red) buttons — verify those pass WCAG AA at the font weights used.
2. **Image alt text** — this project has no photo uploads (out of scope per `SPEC.md` §10), so there's no workshop photo `<img>` to check. Verify any decorative/icon images that do exist have appropriate `alt`.
3. **Button labels** — approve/reject buttons ("Setuju"/"Tolak"), submit button, geocode search button all use visible text labels already (not icon-only), which is good — confirm this doesn't regress into icon-only buttons without `aria-label`.
4. **Heading hierarchy** — one `<h1>` per page (map page title, submit form, admin dashboard "Review Kiriman").
5. **Language attribute** — `<html lang="id">` is set in `layout.tsx`. There is no language toggle in this project (no i18n — all strings are hardcoded Indonesian), so `lang` never needs to change at runtime.

**Flag if:**
- Missing alt text on any image that does exist — **WARNING**
- Buttons without accessible names — **WARNING**
- Color contrast failure on danger/accent buttons — **WARNING**

---

### 9. Review Checklist

- [ ] LCP: `page.tsx` header renders server-side, only the map itself is client-boundary
- [ ] LCP: map placeholder has background + "Memuat peta…" label
- [ ] LCP: Leaflet/react-leaflet only reachable via `dynamic(..., { ssr: false })`
- [ ] INP: submit button and admin approve/reject disable synchronously on click
- [ ] INP: geocode search does not fire on every keystroke
- [ ] CLS: map container height set via `h-[calc(100vh-4rem)]`, not JS-computed
- [ ] CLS: header is fixed `h-16`, doesn't wrap on mobile
- [ ] Payload: total first-load JS under ~300kB gzipped for `/`
- [ ] Payload: no unjustified new dependency
- [ ] Third-party: Nominatim only ever called through `/api/geocode`, never directly from the client
- [ ] Third-party: no analytics/tracking scripts anywhere
- [ ] SEO: `/` has Indonesian meta title + description
- [ ] SEO: `/admin*` is noindex or disallowed in `robots.txt`
- [ ] Accessibility: images (where present) have alt text
- [ ] Accessibility: buttons have accessible names
- [ ] Accessibility: danger/accent button text passes contrast

---

### 10. Exit Criteria

The review is complete when:

1. Every checklist item is confirmed PASS or has a filed finding.
2. All CRITICAL findings include file path, line number, and fix suggestion.
3. All WARNING findings include risk explanation and remediation.
4. A Lighthouse score estimate is given per category with justification.
5. A summary is provided: X critical / Y warning / Z info findings.
