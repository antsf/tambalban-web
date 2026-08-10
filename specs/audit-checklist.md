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
- [ ] **Turnstile** di `/submit` — belum ada. Rate-limit submit sudah terpasang (in-memory, per-instance).
- [x] **Service-role key server-only** — hanya dipakai `worker/src/lib/supabase.ts` dari handler
      `/api/admin/*` setelah `isAdmin()`. Aman.
- [ ] **Honeypot field** di form submit — belum ada.
- [ ] **Jangan bocorkan `error.message` mentah ke client** — kebocoran ditemukan di
      `worker/src/routes.ts:299` (`Gagal upload: ${e.message}`). Ganti dengan pesan generik.
- [x] **Validasi Indonesia bounds + Zod** di setiap route — `worker/src/lib/validation.ts`. Jaga tetap.

## 2. Kinerja (Core Web Vitals)
- [ ] Audit live via skill `web-perf`/Lighthouse — ada `.github/workflows/lighthouse.yml` +
      `lighthouserc.json`, belum dijalankan terakhir.
- [x] **Font** — tidak ada font eksternal (system font stack Tailwind). 0 request font. Konsisten.
- [ ] **Resize foto** saat upload — file asli disimpan, belum ada thumbnail/transform server-side.
- [ ] **Caching GET**: `/api/workshops`, `/api/geocode`, `sitemap.xml` — belum ada `Cache-Control`.
      Dampak terbesar: bbox + viewport statis bisa pakai cache pendek.
- [~] **Leaflet** — via CDN (`leaflet.js`), cuma dimuat di `/` dan `/submit` (`maps` flag di
      `layout.ts`). Bukan bundle. Pertimbangkan juga cache `tailwind.css`.
- [~] **viewport** sudah ada (`layout.ts:86`); **`theme-color`** belum.

## 3. Aksesibilitas
- [~] **Map + fallback daftar** — list sudah keyboard-accessible (`role="button"`, `tabindex=0`,
      Enter/Space, `pages.ts` `rowHtml`) dan membuka popup; peta sendiri tidak keyboard-draggable,
      daftar jadi fallback. Cukup memenuhi.
- [ ] `prefers-reduced-motion` — belum ada animasi signifikan, tapi tak ada media query-nya.
- [~] **Error form** — via `<div id="toast" role="status">`; belum `role="alert"`/`aria-describedby`.
- [ ] Kontras & label: status badge, mobile nav — perlu lint cepat.

## 4. SEO & Metadata
- [x] **`sitemap.xml`** (route; termasuk `/workshops/:id`) + **`robots.txt`** (disallow
      `/admin`, `/login`, `/register`).
      ⚠️ `robots.txt` menunjuk sitemap ke `tambalban.org`; deploy live sementara di
      `tambalban-web.tambalban.workers.dev` — pastikan domain kustom sudah dipetakan.
- [ ] **JSON-LD LocalBusiness** di halaman detail (`pages.ts` `workshopDetailPage`).
- [ ] **Canonical URL** — belum ada.
- [ ] **manifest.json / apple-touch-icon / og-image** — `worker/public/` cuma `robots.txt` +
      `tailwind.css`. (favicon lama di `src/app/` = Next.js deprecated).

## 5. Kualitas Kode & Testing
- [~] **Unit tests (Vitest)** — ada `admin-auth`, `rate-limit`, `validation`. Belum ada route test
      untuk `worker/src/routes.ts`.
- [x] **E2E smoke** — `worker/test/e2e.mjs`. ✔
- [x] **TS strict**, tanpa `any` tanpa `// TODO`.
- [ ] **CI pipeline** (typecheck + vitest + build) — `.github/workflows/` cuma `lighthouse.yml`.
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
1. Tutup kebocoran `error.message` di `routes.ts:299`.
2. `Cache-Control` pada GET `/api/workshops`.
3. CI pipeline (typecheck + vitest + build).
4. JSON-LD + canonical + manifest di halaman detail.