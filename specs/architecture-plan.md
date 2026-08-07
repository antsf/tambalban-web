# Architecture Plan — TambalBan Web

## Problem

The current codebase works but doesn't scale. Everything is in 3 big files:

| File | Lines | Contains |
|------|-------|----------|
| `routes.ts` | 367 | ALL routes (pages + API + admin + bulk + upload) |
| `pages.ts` | 570 | ALL views (home, login, register, submit, admin × 5) |
| `supabase.ts` | 267 | ALL DB operations (12+ functions) |

Adding one feature means touching 3 files that already have 10+ unrelated things in them. This is the #1 source of bugs and slow development.

---

## Target: Feature-Based Modules

Split by **domain**, not by type. Each feature owns its route, view, and DB logic.

```
worker/src/
├── index.ts                        # Entry point: creates Hono app, registers middleware + feature routes
├── lib/
│   ├── env.ts                      # Env interface (unchanged)
│   ├── security.ts                 # CSP + headers middleware (unchanged)
│   ├── rate-limit.ts               # In-memory rate limiter (unchanged)
│   └── supabase-client.ts          # Shared: fetch helpers, WORKSHOP_SELECT, types (Workshop, etc.)
├── features/
│   ├── auth/
│   │   ├── routes.ts               # POST /api/auth/login, register, logout + GET logout
│   │   ├── views.ts                # loginPage(), registerPage()
│   │   └── supabase.ts             # register(), login() — Supabase Auth calls
│   ├── map/
│   │   ├── routes.ts               # GET / (home page), GET /api/workshops, GET /api/geocode
│   │   ├── views.ts                # homePage() + MAP_JS
│   │   └── supabase.ts             # fetchVerifiedWorkshops()
│   ├── submit/
│   │   ├── routes.ts               # GET /submit, POST /api/submissions, POST /api/upload
│   │   ├── views.ts                # submitPage() + SUBMIT_MAP_JS
│   │   └── supabase.ts             # insertSubmission(), uploadImage()
│   ├── admin/
│   │   ├── routes.ts               # GET /admin/*, POST /api/admin/*, bulk routes
│   │   ├── views.ts                # adminLoginPage(), adminQueuePage(), adminAllDataPage(), etc.
│   │   └── supabase.ts             # fetchUnverifiedSubmissions(), fetchAllWorkshops(), publish, remove, bulk
│   ├── users/
│   │   ├── routes.ts               # GET /admin/users, GET /api/admin/users
│   │   └── views.ts                # adminUsersPage()
│   └── reviews/
│       ├── routes.ts               # GET /admin/reviews, GET /api/admin/reviews
│       └── views.ts                # adminReviewsPage()
├── middleware/
│   ├── admin-gate.ts               # isAdmin() check — extracts from admin-auth.ts
│   └── user-auth.ts                # getUserToken(), userEmailFromToken() — extracts from user-auth.ts
├── shared/
│   ├── layout.ts                   # layout(), field(), checkbox(), errorToast(), successToast()
│   ├── validation.ts               # All Zod schemas (unchanged — small, cross-cutting)
│   └── admin-auth.ts               # HMAC session, validateAdminPassword() — unchanged
└── styles/
    └── input.css                   # Tailwind input (unchanged)
```

---

## What Changes (and What Doesn't)

### Unchanged (shared, cross-cutting)
- `lib/env.ts` — Env interface
- `lib/security.ts` — CSP middleware
- `lib/rate-limit.ts` — Rate limiter
- `shared/layout.ts` — Just renamed from `views/layout.ts`
- `shared/validation.ts` — Just renamed from `lib/validation.ts`
- `shared/admin-auth.ts` — Just renamed from `lib/admin-auth.ts`
- `styles/input.css` — Tailwind input

### Refactored
| Current | Target | Why |
|---------|--------|-----|
| `lib/supabase.ts` (267 lines, 12 functions) | Split into `lib/supabase-client.ts` (shared types + helpers) + `features/*/supabase.ts` (domain DB calls) | Each feature owns its data access |
| `routes.ts` (367 lines, 15+ routes) | Split into `features/*/routes.ts` | Each feature owns its routes |
| `views/pages.ts` (570 lines, 10+ views) | Split into `features/*/views.ts` | Each feature owns its views |
| `lib/user-auth.ts` | `middleware/user-auth.ts` | It's middleware, not a lib |
| `lib/supabase-auth.ts` | `features/auth/supabase.ts` | Auth-specific Supabase calls |

### New
- `index.ts` — Grows from 3 lines to ~30 lines: imports all feature route modules, registers middleware, mounts routes

---

## Route Registration Pattern

```typescript
// index.ts
import { Hono } from "hono";
import { securityHeaders } from "./lib/security";
import { authRoutes } from "./features/auth/routes";
import { mapRoutes } from "./features/map/routes";
import { submitRoutes } from "./features/submit/routes";
import { adminRoutes } from "./features/admin/routes";
import { userRoutes } from "./features/users/routes";
import { reviewRoutes } from "./features/reviews/routes";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", securityHeaders);

// Feature routes
app.route("/", authRoutes);
app.route("/", mapRoutes);
app.route("/", submitRoutes);
app.route("/", adminRoutes);
app.route("/", userRoutes);
app.route("/", reviewRoutes);

export default app;
```

Each feature's `routes.ts` exports a `Hono` instance:

```typescript
// features/map/routes.ts
import { Hono } from "hono";

export const mapRoutes = new Hono();

mapRoutes.get("/", (c) => c.html(homePage()));
mapRoutes.get("/api/workshops", async (c) => { ... });
mapRoutes.get("/api/geocode", async (c) => { ... });
```

---

## Migration Strategy

**One feature at a time, zero downtime.**

| Step | What | Risk |
|------|------|------|
| 1 | Create `features/` + `shared/` + `middleware/` directories | None — just creates empty dirs |
| 2 | Move `layout.ts` → `shared/layout.ts`, `validation.ts` → `shared/validation.ts`, `admin-auth.ts` → `shared/admin-auth.ts` | Low — update imports in routes.ts and pages.ts |
| 3 | Extract `supabase-client.ts` (types + WORKSHOP_SELECT + shared helpers) from `supabase.ts` | Low — types don't change behavior |
| 4 | Move `user-auth.ts` → `middleware/user-auth.ts` | Low — update imports |
| 5 | Move `supabase-auth.ts` → `features/auth/supabase.ts` | Low — only used by auth routes |
| 6 | **Auth feature** — extract `features/auth/routes.ts` + `views.ts` | Low — isolated, small |
| 7 | **Map feature** — extract `features/map/routes.ts` + `views.ts` + `supabase.ts` | Medium — main page, test carefully |
| 8 | **Submit feature** — extract `features/submit/routes.ts` + `views.ts` + `supabase.ts` | Medium — has upload, test carefully |
| 9 | **Admin feature** — extract `features/admin/routes.ts` + `views.ts` + `supabase.ts` | Medium — most complex, test bulk actions |
| 10 | **Users + Reviews** — extract remaining admin sub-pages | Low — simple pages |
| 11 | Rewrite `index.ts` to mount all feature routes | Low — just import + mount |
| 12 | Delete old `routes.ts`, `views/pages.ts`, `lib/supabase.ts` | Low — everything migrated |
| 13 | Run full test suite + manual smoke test | — |

Each step is a separate commit. If step 7 breaks, revert that commit — steps 1-6 are safe.

---

## Benefits

| Before | After |
|--------|-------|
| Find "geocode route"? Search 367-line routes.ts | Find "geocode route"? Open `features/map/routes.ts` |
| Add "reviews feature"? Edit 570-line pages.ts | Add "reviews feature"? Create `features/reviews/` |
| "Which DB function does submit use?" → grep supabase.ts | "Which DB function does submit use?" → `features/submit/supabase.ts` |
| Import cycles impossible to trace | Clear dependency: `features/map` → `lib/supabase-client` |
| One merge conflict when two people edit routes.ts | Two people edit different feature dirs — no conflict |

---

## File Size Targets

| File | Current | Target |
|------|---------|--------|
| `routes.ts` | 367 lines | 0 (deleted) |
| `pages.ts` | 570 lines | 0 (deleted) |
| `supabase.ts` | 267 lines | ~40 (shared types + helpers) |
| `features/map/routes.ts` | — | ~80 |
| `features/map/views.ts` | — | ~60 |
| `features/submit/routes.ts` | — | ~90 |
| `features/admin/routes.ts` | — | ~120 |
| `features/admin/views.ts` | — | ~200 |
| `index.ts` | 3 | ~30 |

No file over 200 lines. Each feature is self-contained.

---

## Constraints (from soul.md)

1. **One source of truth** — `tambal_ban` table stays shared. No feature creates its own table.
2. **Admin is password-gated, not per-user** — admin feature stays simple.
3. **No paid deps** — this is a restructuring, no new dependencies.
4. **Free to run** — Cloudflare Workers free tier stays sufficient.

---

*This plan restructures without rewriting. The app works today; it just needs to be split into pieces that make sense.*
