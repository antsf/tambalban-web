---
name: security-review
description: Security review of TambalBan Web's admin auth (password + HMAC session), service-role key exposure, public submission path, rate limiting, and information disclosure.
---

# security-review

Security review for TambalBan Web — a data-collection site with anonymous public submission AND a single-password-gated admin review surface.

## When to use

Run this skill when reviewing any PR or changeset that touches the admin auth (`src/lib/auth.ts`, `src/proxy.ts`), the service-role Supabase client (`src/lib/supabase/admin.ts`), rate limiting, API routes, or environment variables. Also run as a periodic full-project security audit.

## Activation

Trigger: user says "security review", "review security", "audit security", "auth review", or invokes `/security-review`.

## Instructions

**This project has real authentication — do not assume a fully-anonymous threat model.** Unlike `../peta-koperasi` (which has no auth at all), TambalBan Web has exactly one auth surface: `/admin/*`, gated by a shared `ADMIN_PASSWORD` and an HMAC-signed session cookie. Everything else (the public map, the submission form, geocoding) remains anonymous by design. Security here has two distinct halves that must be reviewed differently:

1. **The anonymous half** (`/`, `/submit`, `/api/workshops`, `/api/submissions`, `/api/geocode`) — depends on rate limiting, Indonesia-bounds validation, and RLS to prevent abuse. No PII hashing exists in this project (no vote/fingerprint dedup system — that's `../peta-koperasi`'s model, not this one's).
2. **The admin half** (`/admin/*`, `/api/admin/*`) — depends entirely on the password check + signed cookie + `isAdmin()` gate being correct, and the service-role key never leaking outside that gate.

Work through each section below in order.

---

### 1. Threat Model

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Spam submissions | Queue polluted with fake workshops, wastes reviewer time | Rate limit (5/hour/IP via `src/lib/rate-limit.ts`), all submissions land in `workshop_submissions`, never public until approved |
| Coordinate manipulation | Pins placed outside Indonesia or in the ocean | `INDONESIA_BOUNDS` Zod validation server-side (`src/lib/validation.ts`), plus a client-side `inIndonesia()` check in `submit-form.tsx` (defense-in-depth, not the actual boundary) |
| Admin password brute-force | Full admin access (approve/reject, read all submissions) | Rate limit on `/api/admin/login` (8 attempts / 15 min / IP), constant-time password comparison |
| Session cookie forgery | Unauthorized admin access without the password | HMAC-SHA256 signed token (`<expiresAt>.<signature>`), verified server-side on every admin route — not just at the proxy layer |
| Service-role key exposure | Full DB access bypassing RLS from the client | Confined to `src/lib/supabase/admin.ts`, imported only in `/api/admin/*` routes, each gated by `isAdmin()` |
| Nominatim abuse via `/api/geocode` | Rate-limit ban from OSM's Nominatim, or cost/availability impact | Server-side proxy sets required User-Agent, rate limits (30/min/IP), caches responses (`revalidate: 86400`) |
| Submission -> live data without review | Bad/fake data reaches the Android app's users, potentially in an emergency | `/api/workshops` (public) only ever reads `workshops`, never `workshop_submissions`; the only path into `workshops` is the admin approve action |
| Rate limit bypass | Above threats amplified | In-memory, per-instance limiter — imperfect on multi-instance/multi-region deploys, but raises the bar; see §6 |

---

### 2. Admin Authentication Review (CRITICAL PATH — this is this project's actual auth surface)

This is the section that most differs from a fully-anonymous crowdsourced-map project. Review it with the rigor you'd give any auth system, not the "there is no auth" assumption that applies to `../peta-koperasi`.

**Read `src/lib/auth.ts` and trace:**

1. **Password check is constant-time.** `checkPassword()` uses a manual `timingSafeEqual()` (XOR-accumulate over char codes, length-checked first) rather than `===`. Confirm this hasn't been "simplified" to a direct string comparison, which would leak password length/prefix via timing.
   ```typescript
   // CORRECT (actual implementation)
   function timingSafeEqual(a: string, b: string): boolean {
     if (a.length !== b.length) return false;
     let diff = 0;
     for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
     return diff === 0;
   }
   ```
   Flag any change that replaces this with `a === b` — **CRITICAL**.

2. **Session tokens are HMAC-signed, not just opaque.** `createSessionToken()` produces `<expiresAt>.<hmacSignature>` using `crypto.subtle` with `ADMIN_SESSION_SECRET`. `verifySessionToken()` re-derives the signature from the claimed `expiresAt` and compares it (also via `timingSafeEqual`), and separately checks `expiry >= Date.now()`. Confirm both checks (signature AND expiry) are present — a version that only checks one is a vulnerability. Flag if:
   - Expiry is checked but signature isn't re-verified — **CRITICAL** (any client could set an arbitrary future expiry).
   - Signature is checked but expiry isn't — **CRITICAL** (a leaked old cookie never expires).

3. **`ADMIN_SESSION_SECRET` is required and length-checked.** `getSecret()` throws if the secret is missing or under 16 characters — confirm this validation isn't relaxed. A short/default secret makes the HMAC brute-forceable.

4. **The cookie itself is `httpOnly`, scoped, and environment-aware.** In `POST /api/admin/login`:
   ```typescript
   store.set(ADMIN_COOKIE, token, {
     httpOnly: true,
     sameSite: "lax",
     secure: process.env.NODE_ENV === "production",
     path: "/",
     maxAge,
   });
   ```
   Flag if `httpOnly` is removed (makes the cookie readable by any injected script — XSS-to-session-theft), or if `secure` is hardcoded `false` in a way that would ship to production.

5. **`src/proxy.ts` is a UX redirect, not the real security boundary — this must be true in both directions.**
   ```typescript
   // Cheap gate only — checks cookie EXISTENCE, not validity
   export function proxy(request: NextRequest) {
     if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();
     if (!request.cookies.has(ADMIN_COOKIE)) {
       return NextResponse.redirect(new URL("/admin/login", request.url));
     }
     return NextResponse.next();
   }
   ```
   This only checks that *a* cookie named `tb_admin` exists — it does **not** verify the signature. That's intentional and documented in the code comment, but it means: **every single `/api/admin/*` route MUST independently call `isAdmin()` (full signature+expiry verification) before doing anything.** If any admin route is found that relies on having passed through `proxy.ts` as its only protection, that route is bypassable by simply setting a cookie named `tb_admin` to any garbage value and calling the API route directly (proxy only guards page navigation matched by its `matcher`, not direct API calls, and even for matched paths it never checks the signature). Flag any admin API route missing an explicit `isAdmin()` check as its first statement — **CRITICAL**.

6. **`isAdmin()` is `async` and reads cookies via `next/headers`.** Confirm every caller `await`s it — a missing `await` would make `isAdmin()` always truthy (a Promise is truthy), silently disabling the entire admin gate. This is a subtle, high-impact mistake to check for specifically.

**Admin auth checklist:**
- [ ] `checkPassword()` still uses constant-time comparison
- [ ] `verifySessionToken()` checks both signature AND expiry
- [ ] `ADMIN_SESSION_SECRET` is required, length-validated, never defaulted
- [ ] Session cookie is `httpOnly`, `secure` in production, reasonable `sameSite`
- [ ] Every `/api/admin/*` route calls `await isAdmin()` as its first meaningful statement
- [ ] No route relies on `src/proxy.ts` as its actual security boundary
- [ ] `/api/admin/login` is rate-limited (currently 8/15min/IP) — brute-force guard

---

### 3. Service Role Key Exposure

`SUPABASE_SERVICE_ROLE_KEY` grants full database access, bypassing RLS. It must never reach the browser, and must never be reachable without passing `isAdmin()` first.

**Search for:**
1. Any `"use client"` file referencing `SUPABASE_SERVICE_ROLE_KEY` or importing `src/lib/supabase/admin.ts` — **CRITICAL**.
2. Any `NEXT_PUBLIC_` env var containing the service role key — **CRITICAL** (NEXT_PUBLIC_ vars are bundled into client JS).
3. Any `/api/admin/*` route that calls `createAdminClient()` before (or without) calling `isAdmin()` — **CRITICAL**.
4. `.env.local.example` or equivalent — the service role key should be listed as a placeholder only, never a real value.

The correct pattern, matching `src/app/api/admin/submissions/[id]/route.ts`:
```typescript
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 });
  }
  // ...only after this point is createAdminClient() ever called
}
```

Flag if:
- Service role key in any client-accessible code path — **CRITICAL**
- Service role key in a committed `.env` file — **CRITICAL**
- `createAdminClient()` called before `isAdmin()`, or in a `try` block that could reach it on an error path before the check — **CRITICAL**

---

### 4. Public Submission Path Review

**Trace `POST /api/submissions` (`src/app/api/submissions/route.ts`):**

1. Rate limit checked first: `rateLimit(`submit:${clientIp(request)}`, 5, 60 * 60 * 1000)` — 5/hour/IP, before any parsing or DB work.
2. Body parsed defensively (`try/catch` around `request.json()`).
3. `submissionSchema.safeParse()` validates — including `INDONESIA_BOUNDS` on lat/lng — before any Supabase call.
4. Insert uses the **anon** client (`src/lib/supabase/client.ts`), relying on RLS to allow the public INSERT into `workshop_submissions` — confirm this route never uses `createAdminClient()` (there's no reason a public route should have service-role access).
5. Status is always hardcoded to `"pending"` in the insert — confirm a submitter can never set their own `status`, `reviewed_at`, or `approved_workshop_id` (these should not even be accepted fields from the request body; check `submissionSchema` doesn't include them).

Flag if:
- Rate limit is checked after the DB insert (defeats its purpose) — **WARNING**
- `status` or `approved_workshop_id` can be influenced by request body — **CRITICAL** (would let a submitter self-approve or fake a review)
- The anon client is swapped for the admin client on this route without justification — **WARNING**

---

### 5. Indonesia Bounds Validation

```typescript
// src/lib/validation.ts
export const INDONESIA_BOUNDS = { minLat: -11.0, maxLat: 6.0, minLng: 95.0, maxLng: 141.0 } as const;
const latitude = z.number().min(INDONESIA_BOUNDS.minLat).max(INDONESIA_BOUNDS.maxLat);
const longitude = z.number().min(INDONESIA_BOUNDS.minLng).max(INDONESIA_BOUNDS.maxLng);
```

Confirm this validation happens in the Zod schema (server-side, authoritative), not only in `submit-form.tsx`'s `inIndonesia()` (client-side, UX-only, trivially bypassable by calling the API directly). Both existing, with the server-side one as the real gate, is correct — flag only if the server-side check is ever weakened or removed.

---

### 6. Rate Limiting Review

`src/lib/rate-limit.ts` is an in-memory, per-instance, fixed-window limiter. Its own docstring says: *"Per-instance only — enough to stop casual form spam on a single-region deploy. Swap for Upstash if it ever runs multi-region."* Take that at face value rather than treating in-memory limiting as a bug to fix reflexively.

**Check:**
1. Is the limit checked BEFORE the DB/external-API work in every route that has one? (`/api/submissions`, `/api/geocode`, `/api/admin/login` — all three currently do this correctly; verify any new route follows suit.)
2. Does the response include `Retry-After` on a 429? (All three current routes do.)
3. Is this project actually deployed single-region? If a change to multi-region deployment is proposed, the in-memory limiter becomes meaningfully weaker (each instance has its own counters) — flag this as a dependency that needs addressing *before* going multi-region, per `SPEC.md` §10.
4. `clientIp()` reads `x-forwarded-for` then falls back to `x-real-ip` then `"unknown"` — a request with neither header collapses everyone onto one shared `"unknown"` bucket. This is a known, low-severity gap worth noting but not necessarily blocking, since Vercel sets `x-forwarded-for` in normal operation.

Flag if:
- A new public-write or external-API-proxying route is added without calling `rateLimit()` — **WARNING** to **CRITICAL** depending on abuse potential
- Rate limit checked after the expensive/DB work — **WARNING**
- In-memory limitation is "fixed" by adding fragile complexity instead of an actual distributed store, if multi-region is genuinely being pursued — **INFO**, recommend Upstash or similar per the docstring's own suggestion

---

### 7. SQL Injection / Query Construction Review

The Supabase JS client parameterizes `.from(...).select(...)`/`.insert(...)`/`.update(...)` internally. This project has **no raw SQL, no `.rpc()` calls, no PostGIS functions** (per `CLAUDE.md` rule 9 — no PostGIS at all). The main things to check:

1. `src/lib/geo.ts`'s viewport/search queries use `.gte()`/`.lte()`/`.ilike()` with bound values, not string-interpolated SQL — confirm this stays true.
2. `searchWorkshopsByName` interpolates the user query into an `ilike` pattern: `` `%${query}%` `` — this is safe because it's passed as a parameter to `.ilike()`, not concatenated into raw SQL, but it's worth explicitly confirming no one "optimizes" this into a raw query string later.
3. No `.select()` call should ever take a user-controlled string as its column list.

Flag if: any raw SQL template literal with interpolated user input appears anywhere, or a `.select()` call uses a user-supplied string as the column argument — **CRITICAL**.

---

### 8. Information Disclosure Review

**API responses must never include `workshop_submissions` data on a public route.** The `workshops` table itself has no sensitive/PII columns (no submitter IP, no fingerprint — this project doesn't collect those at all, unlike a vote-dedup-based crowd map), so the disclosure risk here is narrower than in a fully-anonymous project: it's specifically about not leaking *pending/rejected submission data* publicly, and not leaking stack traces/internal error detail.

**Search for:**
1. Any public route (`/api/workshops`, `/api/geocode`) reading from `workshop_submissions` — **CRITICAL**.
2. `.select("*")` on `workshops` or `workshop_submissions` — prefer explicit column lists (the actual `WORKSHOP_COLUMNS` constant in `geo.ts` already does this correctly for the public path; admin routes reading `workshop_submissions` with `.select("*")` are acceptable since that data is only ever returned to an authenticated admin).
3. Error responses leaking raw Supabase error objects or stack traces to the client in a way that reveals schema/internals beyond a human-readable message.

Flag if:
- `/api/workshops` or `/api/geocode` ever reads `workshop_submissions` — **CRITICAL**
- A public route returns `.select("*")` results that happen to include future PII-adjacent columns without review — **WARNING**, revisit if the schema changes
- Full Supabase error objects/stack traces returned in a production response body — **WARNING**

---

### 9. CORS Review

Vercel handles CORS automatically for same-origin requests. Check:
1. Does any route manually set `Access-Control-Allow-Origin`? None currently do.
2. If ever added, `/api/submissions` (a mutation) should not allow `*` — that would let any website submit workshop data on a visitor's behalf, amplifying the spam/abuse surface the rate limiter is meant to bound.
3. `/api/workshops` (read-only, public data) could safely allow `*` if ever needed for embedding — lower risk.

Flag if: `Access-Control-Allow-Origin: *` is added to `/api/submissions`, `/api/admin/*`, or `/api/geocode` — **WARNING** to **CRITICAL** depending on the route.

---

### 10. Security Checklist

**Admin Authentication (this project's actual auth surface):**
- [ ] Password comparison is constant-time
- [ ] Session token verification checks both signature and expiry
- [ ] `ADMIN_SESSION_SECRET` required, length-validated
- [ ] Session cookie is `httpOnly`, `secure` in production
- [ ] Every `/api/admin/*` route calls `await isAdmin()` first, not relying on `proxy.ts` alone
- [ ] `/api/admin/login` is rate-limited

**Service Role Key:**
- [ ] Never referenced in client-accessible code
- [ ] Never in a committed `.env` file
- [ ] `createAdminClient()` only called after `isAdmin()` passes

**Public Submission Path:**
- [ ] Rate limit checked before DB work
- [ ] `INDONESIA_BOUNDS` validated server-side via Zod
- [ ] Submitter cannot set `status`, `reviewed_at`, or `approved_workshop_id`
- [ ] Anon client used, not admin client

**Injection:**
- [ ] No raw SQL with interpolated user values
- [ ] No user-controlled `.select()` column lists
- [ ] No PostGIS/`.rpc()` calls introduced (none should exist per CLAUDE.md rule 9)

**Rate Limiting:**
- [ ] New public-write/proxy routes call `rateLimit()`
- [ ] 429 responses include `Retry-After`
- [ ] Multi-region deployment (if ever proposed) accounts for the in-memory limiter's per-instance limitation

**Information Disclosure:**
- [ ] `/api/workshops`/`/api/geocode` never read `workshop_submissions`
- [ ] No stack traces / raw Supabase errors in production responses

**CORS:**
- [ ] No `Access-Control-Allow-Origin: *` on mutation or admin routes

---

### 11. Exit Criteria

The review is complete when:

1. Every checklist item is confirmed or has a filed finding.
2. All CRITICAL findings include exact file path, line number, the vulnerable code, and a fix.
3. All WARNING findings include risk explanation and remediation.
4. The admin auth trace (§2) has been walked end-to-end: login -> cookie issuance -> `proxy.ts` gate -> `isAdmin()` verification on the actual route.
5. A summary is given: X critical / Y warning / Z info findings.
6. If any CRITICAL finding exists — especially anything in §2 (admin auth) or §3 (service-role key) — the verdict is **FAIL**, and the PR must not merge until fixed.
