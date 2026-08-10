# Best Practices & Audit Checklist — TambalBan Web (worker/)

Status: `[ ]` belum dikerjakan, `[x]` sudah/terpasang, `[~]` sebagian, `[n/a]` tidak berlaku.

> Dokument asli ditulis untuk stack Next.js + Supabase/PostGIS + Leaflet + crowd-voting.
> Versi ini **disesuaikan dengan arsitektur nyata**: Hono + HTMX + Leaflet di Cloudflare
> Workers, tanpa PostGIS, tanpa sistem vote (lihat CLAUDE.md rules 4 & 5).

**Item yang dihapus/diubah karena bertentangan dengan aturan proyek:**
- ~~Vote & Turnstile di vote~~ → tidak ada sistem vote (rule 4). Rate-limit submit/geocode sudah ada.
- ~~PostGIS bbox~~ → perbandingan lat/lon polos (`idx_tambal_ban_location`), sudah benar.
- ~~next.config.ts / vercel.json / next/font / dynamic import / Error Boundary~~ → bukan React:
  server-rendered HTML + HTMX. Referensi: `worker/src/views/layout.ts`, `worker/src/views/pages.ts`.

## 1. Keamanan
- [x] **CSP + security headers** — `worker/src/lib/security.ts`: `X-Content-Type-Options: nosniff`,
      `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
      `Permissions-Policy`, CSP (allow unpkg untuk Leaflet/HTMX, tile OSM, supabase `img-src`;
      `connect-src 'self'` karena Nominatim di-proxy via `/api/geocode`).
- [ ] **Turnstile** di `/submit` — belum ada (butuh setup akun Cloudflare, item prioritas #5). Rate-limit submit sudah terpasang (in-memory, per-instance).
- [x] **Service-role key server-only** — hanya dipakai `worker/src/lib/supabase.ts` dari handler
      `/api/admin/*` setelah `isAdmin()`. Aman.
- [x] **Honeypot field** di form submit — terpasang (`hp_company` hidden input + penolakan di
      `routes.ts` `/api/submissions`).
- [x] **Jangan bocorkan `error.message` mentah ke client** — ditutup di `routes.ts` `/api/upload`
      dan `/api/submissions` (ditemukan & diperbaiki lewat route test 2026-08-10).
- [x] **Validasi Indonesia bounds + Zod** di setiap route — `worker/src/lib/validation.ts`. Jaga tetap.

## 2. Kinerja (Core Web Vitals)
- [x] Audit live via Lighthouse — `.github/workflows/lighthouse.yml` + `lighthouserc.json`,
      hijau (run terakhir 2026-08-10: `/` & `/submit`; `/login` di-drop karena noindex by design).
- [x] **Font** — tidak ada font eksternal (system font stack Tailwind). 0 request font. Konsisten.
- [ ] **Resize foto** saat upload — file asli disimpan, belum ada thumbnail/transform server-side.
- [x] **Caching GET**: `Cache-Control` di `routes.ts` (`/api/workshops` max-age=3600 s-maxage=86400,
      `/api/geocode` max-age=60 s-maxage=300, `sitemap.xml` max-age=300 s-maxage=600).
- [~] **Leaflet** — via CDN (`leaflet.js`), cuma dimuat di `/` dan `/submit` (`maps` flag di
      `layout.ts`). Bukan bundle. Pertimbangkan juga cache `tailwind.css`.
- [x] **viewport** sudah ada (`layout.ts:86`); **`theme-color`** sudah ada (`layout.ts:94`).

## 3. Aksesibilitas
- [~] **Map + fallback daftar** — list sudah keyboard-accessible (`role="button"`, `tabindex=0`,
      Enter/Space, `pages.ts` `rowHtml`) dan membuka popup; peta sendiri tidak keyboard-draggable,
      daftar jadi fallback. Cukup memenuhi.
- [x] `prefers-reduced-motion` — sudah ada media query di `worker/src/styles/input.css`.
- [~] **Error form** — `errorToast` punya `role="alert"` sekarang; form field belum
      `aria-describedby`.
- [ ] Kontras & label: status badge, mobile nav — perlu lint cepat.

## 4. SEO & Metadata
- [x] **`sitemap.xml`** (route; termasuk `/workshops/:id`) + **`robots.txt`** (disallow
      `/admin`, `/login`, `/register`).
      ⚠️ `robots.txt` menunjuk sitemap ke `tambalban.org`; deploy live sementara di
      `tambalban-web.tambalban.workers.dev` — pastikan domain kustom sudah dipetakan.
- [x] **JSON-LD LocalBusiness** di halaman detail (`pages.ts` `workshopDetailPage`).
- [x] **Canonical URL** — dipasang di halaman detail (`layout.ts:93`, `pages.ts:260`).
- [~] **manifest.webmanifest + icon.svg** — sudah ada di `worker/public/`;
      **og-image / apple-touch-icon** belum.

## 5. Kualitas Kode & Testing
- [~] **Unit tests (Vitest)** — ada `admin-auth`, `rate-limit`, `validation` + **`routes.test.ts`**
      (17 test: admin gate, publish/remove, bulk UUID filter, submissions, upload no-leak).
      Masih bisa diperluas ke geocode/sitemap.
- [x] **E2E smoke** — `worker/test/e2e.mjs`. ✔ 84 check.
- [x] **TS strict**, tanpa `any` tanpa `// TODO`.
- [x] **CI pipeline** (typecheck + vitest + build + CSS tracked) — `.github/workflows/ci.yml`,
      hijau; `.github/workflows/lighthouse.yml` juga hijau.
- [n/a] Component tests vote/photo — tidak ada React; ditangkap E2E.

## 6. Operasional / Reliability
- [ ] **Error monitoring** (Sentry / structured log) — belum ada; bukan analytics, tak melanggar
      anti-tracking.
- [x] **RLS & tidak ada leak foto/status** — `fetchVerifiedWorkshops` selalu `verified=true` +
      anon key; upload butuh JWT user. Jangan dilonggarkan.
- [n/a] React Error Boundary — tidak ada React.

## 7. Produk/UX — sudah dikerjakan, jangan sampai terlewat lagi
- [x] Debounce + anti race-condition koordinat/geocode (`requestLoad` 350ms, `SUBMIT_MAP_JS`).
- [x] Inline script per halaman (`MAP_JS`/`SUBMIT_MAP_JS`) — tidak ada global state Leaflet bocor
      antar halaman.
- [x] Validasi client selaras schema Zod server (submit pakai `hx-disabled-elt` + spinner).
- [x] Field optional dikirim `null` bila kosong (`routes.ts:335`).
- [x] `maxLength` input selaras schema Zod.

## Prioritas (kalau mau dikerjakan)
1. ~~Tutup kebocoran `error.message` di routes~~ → **selesai** (route test menjaganya).
2. ~~`Cache-Control` pada GET `/api/workshops`~~ → **selesai**.
3. ~~CI pipeline (typecheck + vitest + build)~~ → **selesai**.
4. ~~JSON-LD + canonical + manifest di halaman detail~~ → **selesai**.
5. Turnstile di `/submit` (butuh setup akun Cloudflare).