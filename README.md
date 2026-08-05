# TambalBan Web

Data-collection website for the [TambalBan](https://github.com/antsf/tambalban) Android app — a
crowdsourced map of tire repair shops (tambal ban) in Indonesia. Same Supabase project as the app;
this site is just another front door onto the `workshops` / `workshop_submissions` tables.

## Stack

- Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind v4
- Supabase (PostgreSQL) — reuses the Android app's project
- Leaflet + OpenStreetMap tiles, Nominatim for geocoding
- Zod for input validation

## Pages

| Route | What |
|---|---|
| `/` | Public map — viewport-bounded query against `workshops` |
| `/submit` | Public form — pin a location, fill details, writes to `workshop_submissions` (status `pending`) |
| `/admin` | Password-gated review queue — approve promotes a submission into `workshops`, reject marks it `rejected` |
| `/admin/login` | Admin password form |

## Setup

```bash
npm install
cp .env.local.example .env.local   # already done in this checkout — fill in the blanks below
```

Fill in `.env.local`:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Settings → API → `service_role` secret. Server-only, never commit.
- `ADMIN_PASSWORD` — whatever you want to log into `/admin` with.
- `ADMIN_SESSION_SECRET` — random 32+ char string, e.g. `openssl rand -hex 32`.

Then run the schema migration once, in the Supabase SQL editor (same project as the app):

```
supabase/migrations/001_web_submission_fields.sql
```

It adds the columns this site needs (`open_time`, `close_time`, `is_24h`, `notes`, `reviewed_at`,
`approved_workshop_id`) to `workshop_submissions` — the app's original `supabase_schema.sql` already
covers `workshops` and the base `workshop_submissions` table.

```bash
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — it's only ever touched by
  `src/lib/supabase/admin.ts`, which every `/api/admin/*` route double-checks against
  `isAdmin()` before use.
- The admin session cookie is `httpOnly`, HMAC-signed (`src/lib/auth.ts`), and expires after 12h.
  `src/proxy.ts` does a cheap existence check to redirect anonymous visitors; the actual signature
  verification happens in the page and in every admin API route.
- Approved-only visibility: `/api/workshops` only ever reads from `workshops` (already-approved
  data), never from `workshop_submissions`.
- Indonesia bounds (`lat -11..6`, `lng 95..141`) are enforced in `src/lib/validation.ts` and checked
  again client-side before submit.
