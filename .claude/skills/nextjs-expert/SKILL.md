---
name: nextjs-expert
description: Primary implementation skill for TambalBan Web — Next.js 16 App Router server/client boundaries, API route handler pattern, react-leaflet SSR fix, Supabase client selection.
---

# nextjs-expert

Primary engineering implementation skill for TambalBan Web — Next.js 16 (App Router, Turbopack) + Supabase + react-leaflet, the web sibling of the TambalBan Android app (`../tambalban`).

## Activation

Use this skill when implementing features, fixing bugs, or writing new code in this project.

---

## Server Components vs Client Components

**Default is Server Component.** Only add `"use client"` when the component genuinely needs browser APIs or interactive state.

### Components that MUST be `"use client"`
- `workshop-map.tsx` — react-leaflet requires the DOM.
- `location-picker.tsx` — same, plus drag/click interactivity.
- `map-panel.tsx` — wraps the `dynamic(..., { ssr: false })` import; the wrapper itself is client because `next/dynamic` with `ssr: false` can only be called from a client component.
- `submit-form.tsx` — controlled inputs, geolocation, debounced geocode calls, client-side Zod-mirroring validation feedback.
- `admin-dashboard.tsx` — fetches submissions, tracks tab/loading/busy state, calls admin API routes.
- `src/app/admin/login/page.tsx` — controlled password input, calls `/api/admin/login`.

### Components that stay Server Components
- `site-header.tsx`, `site-footer.tsx` — static layout, no interactivity.
- `src/app/page.tsx` — server shell; only `<MapPanel />` inside it is a client boundary.
- `src/app/submit/page.tsx` — server shell around `<SubmitForm />`.
- `src/app/layout.tsx` — root layout.

### Decision rule
Ask: "Does this component call `useState`, `useEffect`, `useRef`, or attach an event handler?" If no, it's a server component.

---

## App Router File Structure (actual)

```
src/app/
  layout.tsx                          — root layout (server), wraps SiteHeader + SiteFooter
  page.tsx                            — / (map page, server shell rendering <MapPanel />)
  submit/
    page.tsx                          — /submit (server shell rendering <SubmitForm />)
  admin/
    page.tsx                          — /admin (server shell rendering <AdminDashboard />)
    login/
      page.tsx                        — /admin/login (client component, password form)
  api/
    workshops/route.ts                — GET (viewport or name search)
    submissions/route.ts              — POST (new submission, rate-limited)
    geocode/route.ts                  — GET (Nominatim proxy, rate-limited)
    admin/
      login/route.ts                  — POST (password check, issue session cookie)
      logout/route.ts                 — POST (clear session cookie)
      submissions/
        route.ts                      — GET (list by status, admin-only)
        [id]/route.ts                 — PATCH (approve/reject, admin-only)
```

Every `page.tsx`/`route.ts` uses Next.js's required default/named-by-convention export. Everything else uses named exports.

---

## API Route Handler Pattern

Every API route handler in this project follows this sequence: rate limit (where applicable) -> parse JSON defensively -> Zod validate -> do the work -> return `Response.json(...)`. This project uses the Web `Response.json()` helper directly rather than `NextResponse.json()` — both work, but match the existing convention.

```typescript
// src/app/api/submissions/route.ts (actual pattern)
import { supabase } from "@/lib/supabase/client";
import { submissionSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_SUBMISSIONS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  // 1. Rate limit FIRST, before any parsing or DB work
  const limit = rateLimit(`submit:${clientIp(request)}`, MAX_SUBMISSIONS, WINDOW_MS);
  if (!limit.ok) {
    return Response.json(
      { error: "Terlalu banyak kiriman. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // 2. Parse defensively — request.json() throws on invalid JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  // 3. Zod validate — return early on failure
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Data tidak valid", detail: parsed.error.issues }, { status: 400 });
  }

  // 4. Do the work — anon client is enough here, RLS allows public INSERT
  const { data, error } = await supabase.from("workshop_submissions").insert({ /* ... */ }).select("id").single();
  if (error) return Response.json({ error: `Gagal menyimpan kiriman: ${error.message}` }, { status: 500 });

  return Response.json({ id: data.id, status: "pending" }, { status: 201 });
}
```

**Admin routes add one more required step: the `isAdmin()` gate, first, before anything else:**

```typescript
// src/app/api/admin/submissions/[id]/route.ts (actual pattern)
import { isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewActionSchema } from "@/lib/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 });
  }
  const { id } = await context.params; // Next.js 16: params is a Promise, must be awaited

  // ...parse, validate with reviewActionSchema, then use createAdminClient()
}
```

**Key rules:**
- Rate limiting (where the route has it) happens before any parsing or DB work.
- Zod validation always happens before any Supabase call.
- Admin routes call `isAdmin()` as the very first line — never after any DB read/write.
- All Supabase queries go through `src/lib/supabase/client.ts` (anon, public routes) or `src/lib/supabase/admin.ts` (`createAdminClient()`, admin routes only) or `src/lib/geo.ts` (viewport/search helpers) — never construct a Supabase client inline elsewhere.
- Error responses use a `{ error: string }` shape; validation failures additionally include `detail` (Zod's `.issues`).

---

## `params` Is a Promise (Next.js 16)

Dynamic route params are async in this Next.js version — always `await`:

```typescript
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // ...
}
```

Forgetting the `await` and destructuring `context.params` directly is a build-breaking mistake to watch for in review.

---

## react-leaflet in Next.js: The SSR Problem

`react-leaflet`/`leaflet` access `window`/`document` at import time. The project's fix, consistently applied:

```typescript
// src/components/map-panel.tsx (server-safe wrapper is itself a client component)
"use client";
import dynamic from "next/dynamic";

const WorkshopMap = dynamic(() => import("./workshop-map").then((m) => m.WorkshopMap), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-[#dcd6c8]">…</div>,
});

export function MapPanel() {
  return <WorkshopMap />;
}
```

`src/app/page.tsx` (a server component) renders `<MapPanel />`, never `<WorkshopMap />` directly. See `leaflet-expert` for full detail on this project's map patterns — they are declarative (`<Marker>`, `<Popup>`), not imperative Leaflet DOM calls.

---

## No Photo Upload / multipart Handling in This Project

Unlike some crowdsourced-map projects, TambalBan Web has **no photo upload** for submissions (`SPEC.md` §10 — out of scope for v1; noted as something the Android app's `AddWorkshopActivity` might add later, not mirrored here). All API bodies are plain JSON (`request.json()`), not `FormData`. Don't introduce `multipart/form-data` handling speculatively.

---

## Viewport Re-fetch Pattern (actual)

See `leaflet-expert` for full detail. Summary: `workshop-map.tsx` uses `useMapEvents` (react-leaflet hook) for `moveend`/`zoomend`, debounces 400ms, and uses `AbortController` to cancel a stale in-flight `/api/workshops` request when the user pans again mid-fetch.

---

## No i18n in This Project

Unlike a bilingual project, **TambalBan Web has no `messages/*.json`, no `useTranslation()`/`getTranslation()`.** All user-facing strings are hardcoded Indonesian directly in JSX (e.g. `"Terlalu banyak kiriman. Coba lagi nanti."`, `"Memuat peta…"`). Do not introduce an i18n system or suggest extracting strings to message files — that's not this project's architecture. If a string needs to change, edit it in place in the component/route file.

---

## Auth: Admin Password + Signed Cookie (No Supabase Auth, No NextAuth)

This project is not fully anonymous like some crowdsourced-map siblings — it has one, narrow auth surface for `/admin/*`:

- `src/lib/auth.ts`: `checkPassword()` (constant-time compare against `ADMIN_PASSWORD`), `createSessionToken()`/`verifySessionToken()` (HMAC-SHA256 signed `<expiresAt>.<signature>` token, 12h TTL), `isAdmin()` (reads the `tb_admin` cookie via `next/headers` `cookies()` and verifies the signature).
- `src/proxy.ts`: a cheap existence-only cookie check (`request.cookies.has(ADMIN_COOKIE)`) that redirects to `/admin/login` if absent — this is a fast UX redirect, **not** the actual security boundary. Every `/api/admin/*` route independently calls `isAdmin()` (full signature + expiry verification) before touching the service-role client.
- Never add Supabase Auth, NextAuth, or per-user accounts (`CLAUDE.md` rule). This single shared-password model is intentional — see `security-review` for the full threat model.

---

## Supabase Client Selection

### `src/lib/supabase/client.ts` — anon key
- Used for: public reads (`getWorkshopsInBounds`, `searchWorkshopsByName` in `src/lib/geo.ts`) and the one public write (`POST /api/submissions` inserting into `workshop_submissions`, which RLS allows anonymously).
- Safe to reference from server-side route handlers; not imported into client components directly (all Supabase access happens through API routes, per `CLAUDE.md`'s "Supabase queries go through route handlers using client.ts/admin.ts" rule).

### `src/lib/supabase/admin.ts` — `createAdminClient()`, service-role key
- Used only inside `/api/admin/*` route handlers, and only after `isAdmin()` returns `true`.
- Bypasses RLS entirely — this is how `workshops` rows get created on approve, and how `workshop_submissions` get read/updated regardless of status.
- **Never import this from a `"use client"` file or any component.** The service-role key must never reach the browser bundle.

---

## Common Mistakes to Catch

1. **Forgetting `"use client"`** on a component that uses `useState`/`useEffect`/event handlers.
2. **Using `useEffect` to fetch in a server component** — just `await` directly in the async server component.
3. **Importing `react-leaflet`/`leaflet` at module level in a server-rendered file.**
4. **Inline `supabase.from(...)` in a component** instead of going through `src/lib/geo.ts` or a route handler.
5. **Skipping `isAdmin()`** on a new `/api/admin/*` route, or checking it after a DB call instead of before.
6. **Forgetting `await context.params`** in a dynamic route handler (Next.js 16).
7. **Inventing i18n or photo-upload code** that doesn't match this project's actual scope — check `SPEC.md` §10 first.
8. **Missing explicit rate limiting** on a new public-write or geocode-adjacent route — check whether it should use `src/lib/rate-limit.ts` like the existing ones do.

---

## Checklist Before Committing a Next.js File

- [ ] Server or client? `"use client"` present only if genuinely needed?
- [ ] If it uses react-leaflet: loaded via `dynamic(..., { ssr: false })`?
- [ ] If it's an API route: rate limit (if applicable) -> Zod validation -> DB work, in that order?
- [ ] If it's an admin route: `isAdmin()` checked first, before any DB access?
- [ ] Dynamic route params: `await`ed, not destructured synchronously?
- [ ] No `any` types (or has a `// TODO:` comment)?
- [ ] Supabase queries go through `src/lib/geo.ts`, `src/lib/supabase/client.ts`, or `src/lib/supabase/admin.ts` — not inline elsewhere?
- [ ] Service-role client (`admin.ts`) never imported into a client component?
- [ ] User-facing strings are plain hardcoded Indonesian — no invented i18n system?
- [ ] File name is kebab-case?
- [ ] Tailwind only — no CSS modules, no `style=` objects?

---

## Exit Criteria

A task using this skill is complete when:
1. The implemented code compiles with `npm run build` (no TypeScript errors, no build warnings).
2. Server/client boundary is correct — no hydration mismatches.
3. react-leaflet components load without SSR crashes.
4. API routes follow the rate-limit-then-Zod-then-DB pattern, with `isAdmin()` gating every admin route.
5. The service-role key never appears in client-reachable code.
6. All DB access goes through `src/lib/geo.ts` or the two Supabase client modules.
7. No i18n system or photo-upload handling was invented that doesn't match `SPEC.md`.
