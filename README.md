# TambalBan Web

Data-collection website for the [TambalBan](https://github.com/antsf/tambalban) Android app — a
crowdsourced map of tire repair shops (tambal ban) in Indonesia. Same Supabase project as the app;
this site is just another front door onto the shared `tambal_ban` table.

> **MID-REWRITE (2026-08).** This codebase was rewritten from Next.js to a lightweight stack
> (HTML/CSS/JS + HTMX + Hono) on **Cloudflare Workers**, on the real shared table `tambal_ban`.
> The live implementation is in **`worker/`**. The old Next.js code in `src/` still targets the
> retired `workshops`/`workshop_submissions` design, does **not** work against the live DB, and is
> deprecated scaffolding — reference only, to be deleted once the rewrite is finished.
> `SPEC.md` describes the target state and is accurate.

## Features

- Public map reading only `verified=true` rows from `tambal_ban` (Leaflet + OSM tiles,
  viewport-by-viewport fetch + name/city search).
- Register/login via **Supabase Auth** — the same account store as the Android app. The access
  token rides in an HttpOnly cookie (`tb_access_token`).
- Submit form (login required, rate-limited) inserting `source='user'`, `verified=false`;
  an admin flips `verified=true` to publish. Indonesia-bounds validated server-side (Zod).
- Admin gate: shared `ADMIN_PASSWORD` + HMAC-signed cookie, scoped to `/admin/*`. The admin
  queue supports publish/remove, bulk publish/remove, an all-data page with infinite scroll,
  and users + reviews management pages.
- Nominatim geocoding proxied through `GET /api/geocode` (server sets `User-Agent`, rate-limits).
- Session-aware pages: the header renders the real login state (anonymous / contributor /
  admin) on every page, and logged-in users don't see the login/register forms again.
- Security headers (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Details: [`SPEC.md`](./SPEC.md), [`CHANGELOG.md`](./CHANGELOG.md), philosophy: [`../soul.md`](../soul.md).

## Stack

- Hono on Cloudflare Workers (free 100k req/day), server-rendered HTML + HTMX 2 + vanilla JS.
- Tailwind CSS v3 precompiled to `worker/public/tailwind.css` (no CDN at runtime).
- Zod v4 validation; TypeScript strict.

## Setup

```bash
npm install --prefix worker
```

Fill in `worker/.dev.vars` for local dev (secrets, gitignored — generate from `../.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase dashboard → Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — dashboard → Settings → API → anon key (public, RLS-scoped)
- `SUPABASE_SERVICE_ROLE_KEY` — dashboard → Settings → API → `service_role` secret. Server-only, never commit.
- `ADMIN_PASSWORD` — whatever you want to log into `/admin` with.
- `ADMIN_SESSION_SECRET` — random 32+ char string, e.g. `openssl rand -hex 32`.
- `NOMINATIM_USER_AGENT` (optional) — identifies this app to OSM geocoding.

Run the schema migration once, in the Supabase SQL editor (same project as the app):

```
supabase/migrations/002_tambal_ban_attributes_user_submissions.sql
```

(Adds `user_id` + auto-stamp trigger, contact/service/OSM columns, `verified_at`, fixes RLS.
`001_web_submission_fields.sql` is obsolete — it targeted the retired `workshop_submissions` table.)

OSM import (optional starter data):

```bash
node scripts/scrape-osm-workshops.mjs            # dry-run
node scripts/scrape-osm-workshops.mjs --apply    # insert into tambal_ban
```

Run locally:

```bash
cd worker
npm run dev       # http://localhost:8787
npm run build:css # recompile Tailwind (auto before deploy)
npm run check     # tsc --noEmit
npm run test      # Vitest unit tests
npm run test:e2e  # E2E smoke test (needs `npm run dev` running; ~65s between runs due to rate limit)
```

Deploy:

```bash
cd worker
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # once per secret
wrangler secret put ADMIN_PASSWORD
wrangler secret put ADMIN_SESSION_SECRET
npm run deploy
```

> `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not secrets — set them in the
> Workers dashboard (Settings → Variables) or in `wrangler.jsonc` `vars`.

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — used only by `/api/admin/*` handlers,
  each of which verifies the admin HMAC session first.
- Public routes only ever read `verified=true` rows from `tambal_ban` — never unverified data.
- Anonymous INSERT is blocked by RLS (`user_insert` requires an authenticated token); the submit
  route sends the logged-in user's JWT as `Authorization: Bearer` (anon key only as `apikey`).
- Indonesia bounds (`lat -11..6`, `lng 95..141`) enforced in `worker/src/lib/validation.ts`.
- Submission & geocode endpoints are rate-limited per IP.
