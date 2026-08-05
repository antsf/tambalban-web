# TambalBan Web

Data-collection website for the [TambalBan](https://github.com/antsf/tambalban) Android app — a
crowdsourced map of tire repair shops (tambal ban) in Indonesia. Same Supabase project as the app;
this site is just another front door onto the shared `tambal_ban` table.

> **MID-REWRITE (2026-08).** This codebase is being rewritten from Next.js to a lightweight stack
> (HTML/CSS/JS + HTMX + Hono, Cloudflare Workers) and pivoted to the real shared table
> `tambal_ban`. The current Next.js code in `src/` still targets the retired
> `workshops`/`workshop_submissions` design and does **not** work against the live DB — treat it as
> deprecated scaffolding. `SPEC.md` describes the target state.

## Target (the rewrite)

- Public map reading only `verified=true` rows from `tambal_ban` (Leaflet + OSM tiles).
- Register/login via **Supabase Auth** — the same account store as the Android app.
- Submit form (login required) inserting `source='user'`, `verified=false`; an admin flips
  `verified=true` to publish.
- Admin gate: shared `ADMIN_PASSWORD` + HMAC-signed cookie.
- Details: [`SPEC.md`](./SPEC.md), philosophy: [`../soul.md`](../soul.md).

## Current (deprecated) stack

- Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4
- Supabase (PostgreSQL) — reuses the Android app's project
- Leaflet + OpenStreetMap tiles, Nominatim for geocoding (proxied via `/api/geocode`)
- Zod for input validation

## Setup

```bash
npm install
```

Fill in `.env.local` (copy of `.env.local.example` pattern — create it):

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

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — server-only, only in admin routes.
- Public routes only ever read `verified=true` rows from `tambal_ban` — never unverified data.
- Anonymous INSERT is blocked by RLS (`user_insert` requires an authenticated token); the web app
  will send the logged-in user's token once Supabase Auth is wired in.
- Indonesia bounds (`lat -11..6`, `lng 95..141`) enforced in `src/lib/validation.ts`.
