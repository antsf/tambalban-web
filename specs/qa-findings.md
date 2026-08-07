# QA Findings — TambalBan Web (2026-08-07)

Follow-up audit to `skill-audit-findings.md`. Three rounds of review against the live
`worker/stack` and the deployed behavior: an anomaly audit of the admin/submit code paths,
a full E2E smoke test, and a session-consistency audit triggered by a user report.

**Status key:**
- ✅ Fixed — shipped in the listed commit
- ⏭️ Audit-only — confirmed correct, no fix needed
- 🧪 Covered — verified by the E2E suite in `test/e2e.mjs`

---

## 1. Anomaly Audit (commit `55033ee`)

Reviewed the admin bulk actions, the search path, and the admin data page for
response-handling and validation bugs.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| Q1 | Search with `%` (or `_`, `\`) matched **every** row — ilike wildcards were not escaped | High | ✅ Fixed (`supabase.ts`: `escapeIlike()`) |
| Q2 | Bulk publish/remove accepted any id string — a non-UUID crashed the DB call | High | ✅ Fixed (`routes.ts`: `UUID_RE` filter → 400) |
| Q3 | Infinite-scroll `offset` was dropped — page 2+ re-fetched page 1 | Medium | ✅ Fixed (`supabase.ts`: `q.offset` passed through) |
| Q4 | Bulk operation response status never checked — failures looked successful | Medium | ✅ Fixed (`pages.ts`: `res.ok` check on bulk responses) |
| Q5 | `loadMore()` busy flag could stick true on error — scroll got permanently disabled | Medium | ✅ Fixed (`pages.ts`: `.finally()` resets flag) |
| Q6 | Queue count not refreshed after bulk publish/remove | Low | ✅ Fixed (`pages.ts`: `updateQueueCount()` after bulk ops) |
| Q7 | `AdminDataQuery` type missing `offset` — compiler couldn't catch Q3 | Low | ✅ Fixed (`supabase.ts`: type extended) |
| Q8 | Duplicate `esc()` — client-side and server-side escaping duplicated | Low | ✅ Fixed (`pages.ts`: `CLIENT_ESC` shared const) |
| Q9 | `GET /api/admin/workshops` returned JSON but was used for HTMX swap | Low | ⏭️ Kept as HTML — JSON was correct per HTMX contract; no change |
| Q10 | Unused `_index` param in `submissionCard` | Low | ✅ Fixed (`pages.ts`: removed) |

## 2. E2E Smoke Test (commit `6d87f26`)

`test/e2e.mjs` — 73 checks over 12 scenarios (80 after the session-consistency additions).
Runs against a live `wrangler dev` server.

| Scenario | Outcome |
|----------|---------|
| Public pages (/, /submit, /register, /login) | ✅ 200 + expected content |
| Auth flow (register, login, cookie flags, logout) | ✅ includes HttpOnly check |
| Workshops API (bbox, search, wildcard-escape) | ✅ `%` does NOT match all rows |
| Submit flow (auth required, bounds, validation, rate-limit) | ✅ 401/400/429 semantics |
| Geocode API (proxy, min-length, escaping) | ✅ XSS input escaped |
| Admin auth (wrong/empty/correct password, cookie, gate) | ✅ 401/400/302 semantics |
| Admin pages | ✅ skipped without session |
| Bulk operations guards | ✅ 401 unauthenticated |
| Upload API | ✅ 401 unauthenticated |
| Sitemap + robots.txt | ✅ admin/auth disallowed |
| Security headers (CSP, nosniff, DENY, referrer, permissions-policy) | ✅ |
| Error handling (404, missing query) | ✅ |

Notes:
- Rate limiter (60s window, 5/IP on submit + admin login) will 429 a second run within the
  window — expected, not a bug. Wait ~65s between runs.
- Earlier 401s observed during manual testing were rate limiting, not JWT clock skew.

## 3. Session-Consistency Audit (commit `654a8d9`)

Triggered by a user report: logged in as **admin**, clicking "Tambah" landed on a
"Masuk dulu untuk menambah" dead-end and the admin nav disappeared.

Root cause: the admin session (`tb_admin_session`) and the contributor session
(`tb_access_token`) are **separate auth mechanisms**. Public pages never passed session
state to the layout, so the header always rendered as anonymous.

| # | Symptom | Status |
|---|---------|--------|
| S1 | Admin clicks "Tambah" → "Masuk dulu untuk menambah" + admin nav lost | ✅ Fixed — `/submit` shows a "Sesi admin terpisah" explainer card with admin nav preserved |
| S2 | Logged-in contributor visits `/` → header shows "Masuk" instead of "Keluar" | ✅ Fixed — layout receives `{email, admin}` |
| S3 | Admin visits `/` → header "Masuk", admin nav lost | ✅ Fixed — layout receives admin flag |
| S4 | Logged-in contributor visits `/login` / `/register` → form still shown | ✅ Fixed — redirect to `/submit` |
| S5 | Admin visits `/admin/login` → form still shown | ✅ Fixed — redirect to `/admin` |
| S6 | `?submitted=1` after submit shows no confirmation toast | ✅ Fixed — success toast from query param |
| S7 | `?registered=1` after email confirm shows no toast | ✅ Fixed — success toast from query param |

Implementation: `getSession()` in `routes.ts` reads both cookies once per request;
`homePage`/`loginPage`/`registerPage`/`submitPage` accept the session state. Covered by the
new scenario 4b in `test/e2e.mjs`.

---

## Files Modified

### Commit `55033ee` — anomaly fixes

| File | Changes |
|------|---------|
| `worker/src/lib/supabase.ts` | `escapeIlike()`; `offset` passthrough; `AdminDataQuery.offset` |
| `worker/src/routes.ts` | `UUID_RE` filter on bulk publish/remove ids |
| `worker/src/views/pages.ts` | `res.ok` checks, `.finally()` busy reset, `updateQueueCount()`, `CLIENT_ESC`, removed `_index` |

### Commit `6d87f26` — E2E suite

| File | Changes |
|------|---------|
| `worker/test/e2e.mjs` | New — 73 checks, 12 scenarios |
| `worker/package.json` | `test:e2e` script |

### Commit `654a8d9` — session consistency

| File | Changes |
|------|---------|
| `worker/src/routes.ts` | `getSession()`; session-aware `/`, `/login`, `/register`, `/submit`, `/admin/login`; flash toasts |
| `worker/src/views/pages.ts` | session-aware pages; admin explainer card; flash params |
| `worker/test/e2e.mjs` | Scenario 4b — 7 new session-consistency checks (80 total) |
