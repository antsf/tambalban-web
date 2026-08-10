# Changelog

All notable changes to TambalBan Web will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Social-share card: links to the site now preview with a branded tire image
  (`og-image.png`) when shared on WhatsApp, Facebook, or Telegram, and iOS users
  adding the site to their home screen get a matching app icon
- Photo uploads are downscaled and re-encoded to WebP on the server (longest edge
  capped at 1600px) before storing — smaller files mean faster uploads on slow
  connections and less storage
- Success toasts after a submission (`/?submitted=1`) and after account creation
  (`/login?registered=1`) — the HTMX redirect previously swallowed the confirmation message
- E2E smoke suite (`npm run test:e2e`): 80 checks across pages, auth flow, workshops API,
  submit, geocode, admin auth/pages, bulk guards, upload, sitemap/robots, security headers,
  and session-consistency
- Workshop detail page (`/workshops/:id`): clicking "Detail" on a marker, a result, a map
  popup opens a page showing every field — address, phone, WhatsApp, website, Instagram,
  hours, all 8 services, plus call/WhatsApp/open-location actions
- Workshop pages are now included in `sitemap.xml`

### Fixed
- Map rendered blank because the Content-Security-Policy `style-src` blocked the Leaflet
  stylesheet loaded from `unpkg.com` — `unpkg.com` is now allowed for stylesheets, so tiles
  and popups render again
- Workshop images from Supabase Storage are now allowed by `img-src`
- Session consistency across public pages: the header now reflects real login state instead
  of always showing "Masuk" — logged-in contributors see "Keluar", admins keep their nav, and
  an admin visiting `/submit` sees an explainer card (admin session is separate from the
  contributor account) instead of a dead-end "Masuk dulu untuk menambah" prompt
- `/login` and `/register` redirect already-logged-in users to `/submit`; `/admin/login`
  redirects admins to `/admin`
- Search: `%` and `_` wildcards in the name/city query are escaped, so searching them no
  longer matches every workshop on the map
- Bulk publish/remove: invalid UUIDs are rejected with 400, DB response errors are surfaced,
  and the queue count refreshes after a bulk action completes
- Infinite scroll on the admin all-data page resets its loading flag reliably after an error

## [0.1.0] - 2026-08-06

### Added
- Full rewrite from the deprecated Next.js scaffolding (`src/`) to a Hono + HTMX + Tailwind
  worker (`worker/`) on Cloudflare Workers, on the real shared `tambal_ban` table
- Public map (Leaflet + OSM tiles) showing only `verified=true` workshops, loaded
  viewport-by-viewport with name/city search
- Contributor accounts via Supabase Auth (register/login); the access token rides in an
  HttpOnly cookie and is sent as `Authorization: Bearer` on submit
- Submission form with map pin placement, Nominatim geocoding, "pakai lokasi saya"
  geolocation, and image upload to the shared `workshops` storage bucket; rate-limited and
  validated against Indonesia bounds server-side (Zod)
- Admin: shared-password login with HMAC-signed session cookie, review queue with
  publish/remove, bulk publish/remove, all-data page with infinite scroll, and users +
  reviews management pages
- Accessibility: skip link, non-map results list with "Lihat di peta" buttons, `aria-live`
  regions, focus-marker, `autocomplete` attributes, and footer contrast fixes
- Security: CSP + security headers middleware, `sitemap.xml`, and `robots.txt` (admin/auth
  routes disallowed); public routes never read unverified rows
- Tooling: Vitest unit tests, Lighthouse CI workflow, and an OSM import script
- Header menu with 3 states (anonymous / contributor / admin), hamburger layout on mobile,
  and an admin divider

### Changed
- Primary CTA and publish actions use emerald branding; workshop cards use the slate chrome
  design language

---

*Changelog starts at the 2026-08 rewrite. Earlier Next.js commits were scaffolding for the
retired `workshops` / `workshop_submissions` design and are not user-visible history.*
