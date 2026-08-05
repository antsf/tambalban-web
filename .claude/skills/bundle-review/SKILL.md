---
name: bundle-review
description: JS bundle size review for TambalBan Web against a 300kB gzipped budget — Leaflet dynamic-import verification, layout.tsx import audit, dependency rejection criteria.
---

# bundle-review

JavaScript bundle size review for a map application serving stranded drivers, often on budget Android phones with a weak signal on the roadside.

## When to use

Run this skill when adding or updating dependencies, before a release milestone, when `next build` output shows unexpected size increases, or when investigating slow page loads. Also run when reviewing any PR that adds a new `import` statement for an external package.

## Activation

Trigger: user says "bundle review", "bundle size", "bundle analysis", "dependency review", "check bundle", or invokes `/bundle-review`.

## Instructions

You are reviewing JavaScript bundle size for TambalBan Web. Read `soul.md` for why this matters here specifically: a flat tire always happens at the wrong time — at night, on a toll road, somewhere the signal is weak. Every unnecessary kilobyte is time a stranded driver spends staring at a loading spinner instead of finding a workshop. This is not an abstract performance goal; it maps directly to the project's stated mission.

Work through each section below in order. Read the relevant files, report findings, and flag violations.

---

### 1. Bundle Budget

**Total JS budget (gzipped, first load): 300kB**

A budget Android phone on a weak or congested connection (~400kbps effective throughput, worse near a toll road with poor signal) takes ~6 seconds to download 300kB. Add parse/compile time on a slow CPU and you are at 8-10 seconds before the page is interactive. This is already pushing the limit for someone standing next to a flat tire.

| Component | Budget (gzipped, rough) | Notes |
|-----------|------------------------|-------|
| Next.js 16 + React 19 framework | ~90kB | Non-negotiable, framework cost |
| `react-leaflet` + `leaflet` | ~45kB | Core mapping library — only on `/` and `/submit`, never on `/admin/*` |
| Zod v4 | ~13kB | Client-side/server-side validation, shared schema |
| Tailwind CSS v4 (fully purged) | ~10-15kB | |
| App code | remaining (~130kB) | All custom components, `src/lib/*` |

**No FingerprintJS, no i18n framework, no icon library, no UI component library are in this project.** Do not budget for them and flag any PR that introduces one without strong justification — see §8.

Any new dependency must justify its gzipped size against the remaining budget.

---

### 2. How to Run Bundle Analysis

**Method 1: `next build` output**

Run `next build` and read the route-by-route size table. Each route shows:
- Size: the route-specific JS
- First Load JS: route JS + shared chunks (this is what matters)

Check `/` (map, heaviest), `/submit` (map + form, heaviest of all), `/admin` and `/admin/login` (should be much lighter — no Leaflet).

**Method 2: `@next/bundle-analyzer`**

Check if `@next/bundle-analyzer` is in `package.json` devDependencies. If installed:
```bash
ANALYZE=true next build
```
If not installed, recommend adding it as a devDependency for any deep investigation.

**Method 3: Manual inspection**

Read `package.json` dependencies (currently: `@supabase/supabase-js`, `leaflet`, `next`, `react`, `react-dom`, `react-leaflet`, `zod`). For each, estimate gzipped size using bundlephobia data if `next build` output isn't available.

---

### 3. Leaflet Dynamic Import Verification

Leaflet must be in a separate chunk, loaded only when a map component mounts. It must NOT be in the main page JS bundle or in `layout.tsx`.

**Verify (this pattern already exists — confirm it hasn't regressed):**

1. `src/components/map-panel.tsx` wraps `WorkshopMap` in `next/dynamic(() => import("./workshop-map").then(...), { ssr: false })` — this is correct, verify it stays this way.
2. `src/components/submit-form.tsx` wraps `LocationPicker` the same way — `next/dynamic(() => import("./location-picker")..., { ssr: false })` — verify this stays too, since the submit form is the second-heaviest page (map + form logic together).
3. Search for `import L from "leaflet"` or `import ... from "react-leaflet"` across the whole `src/` tree. It must ONLY appear inside `workshop-map.tsx` and `location-picker.tsx` (and any file only imported by those two).
4. Search `src/app/layout.tsx` and both `page.tsx` root-level files for any Leaflet import — must not exist. `layout.tsx` should only import `SiteHeader`, `SiteFooter`, fonts, and `globals.css`.
5. Check that `"leaflet/dist/leaflet.css"` is imported only inside `workshop-map.tsx`/`location-picker.tsx`, not in `globals.css` or `layout.tsx`. (The Leaflet-specific style overrides in `globals.css`, e.g. `.leaflet-container`, `.leaflet-popup-content-wrapper`, are just CSS rules that only *apply* when Leaflet's own classes are present — they do not pull in the JS library. Do not flag those as a Leaflet-in-bundle issue.)

**Flag if:**
- Leaflet or `react-leaflet` imported in `layout.tsx`, `admin-dashboard.tsx`, or any admin-side file — **CRITICAL**
- `leaflet.css` imported outside the two map component files — **WARNING**
- Either `WorkshopMap` or `LocationPicker` loses its `dynamic(..., { ssr: false })` wrapper — **CRITICAL**

---

### 4. The "Imported on Every Page" Trap

Any module imported in `src/app/layout.tsx` (the root layout) becomes part of the shared chunk loaded on EVERY page, including `/admin` — which has no business paying for map-related JS.

**Audit `layout.tsx` imports:**

1. Read `src/app/layout.tsx`. Current imports: `Geist`/`Geist_Mono` fonts (via `next/font/google`, self-hosted and split by Next.js automatically — not a bundle concern), `SiteHeader`, `SiteFooter`, `globals.css`.
2. Verify `SiteHeader`/`SiteFooter` (`src/components/site-header.tsx`, `site-footer.tsx`) stay lightweight — they are plain server-renderable components with no Leaflet, no client-side data fetching. Flag if either gains a client-side effect or a heavy import.
3. Search for any heavy dependency in the import chain from `layout.tsx` downward. If layout imports a component that imports a heavy library, that library is in the shared chunk.

**Flag if:**
- Layout imports anything that transitively imports `leaflet`/`react-leaflet` — **CRITICAL**
- Layout imports a component exceeding ~20kB gzipped — **WARNING**

---

### 5. Tree Shaking Verification

**Tailwind CSS v4:**
- Verify the project still uses the v4 CSS-first approach — `@import "tailwindcss";` and `@theme { ... }` inside `src/app/globals.css` (this is the actual current setup, not a `tailwind.config.ts` content-glob approach — v4 scans automatically). Flag any regression to a `tailwind.config.ts`-based v3-style setup without justification, since that would be a stack downgrade.
- Search for `import 'tailwindcss/tailwind.css'` (the old full-CSS import) — must not exist.

**No icon library, no lodash, no date library are dependencies of this project.** If a PR adds one:
- Icon library: verify individual icon imports, not a barrel import (`import { MapPin } from "lucide-react"` not `import * as Icons from "lucide-react"`), and question whether the ~10 lines of custom SVG this project currently uses (see `workshop-map.tsx`'s `pinIcon()`, a hand-built `L.divIcon` with inline SVG-free HTML) could be extended instead of pulling in a library at all.
- Any utility library (lodash, date-fns, etc.): question whether the 1-2 functions needed could be written inline, matching the project's existing minimal-dependency footprint (`src/lib/geo.ts`'s hand-written `haversineKm()` is the precedent — this project writes small utilities rather than importing them).

**Flag if:**
- Full Tailwind CSS imported the old way — **CRITICAL**
- Barrel import of any new icon/utility library — **WARNING**
- A new dependency duplicates something a 10-20 line function in `src/lib/` could do — **WARNING**

---

### 6. Dependency Rejection Criteria

Any dependency should be rejected if:

1. **Size > 50kB gzipped** without explicit justification documented in a comment or PR description
2. **Duplicate functionality:** a second map library, a second validation library, a second HTTP/data-fetching library alongside `@supabase/supabase-js`
3. **UI component library** (MUI, Chakra, Radix, shadcn) — the project uses hand-rolled Tailwind utilities (`card-brutal`, `btn-brutal`, `input-brutal` in `globals.css`). A component library would conflict with the existing neo-brutalist styling approach and add 50-200kB for components already built.
4. **State management library** (Redux, Zustand, Jotai) — every page's state is currently local `useState` (map viewport in `WorkshopMap`, form fields in `SubmitForm`, tabs in `AdminDashboard`). Nothing here needs global state.
5. **Animation library** (Framer Motion, GSAP) — the current UI has no animation beyond CSS transitions already defined in `globals.css` (`.btn-brutal`'s `transition: transform 80ms ...`). Question any addition against that baseline.
6. **Client-side auth library** (NextAuth, Clerk, Auth0) — auth here is a single shared password + a hand-rolled HMAC-signed cookie (`src/lib/auth.ts`). This is intentional per CLAUDE.md; a full auth library would be a massive over-build for "one password."

**Review `package.json` dependencies:**

1. Read `package.json`.
2. For each dependency, verify it is in the approved list or has clear justification.
3. For each devDependency, verify it is not accidentally imported in `src/` (which would bundle a dev-only tool into production).

**Approved dependencies (current, from `package.json`):** `next`, `react`, `react-dom`, `react-leaflet`, `leaflet`, `zod`, `@supabase/supabase-js`. Dev: `tailwindcss`, `@tailwindcss/postcss`, `typescript`, `eslint`, `eslint-config-next`, `@types/*`.

**Flag if:**
- Unapproved dependency exceeding 50kB — **CRITICAL**
- Duplicate functionality — **WARNING**
- devDependency imported in `src/` source code — **CRITICAL**

---

### 7. Tracing a Bundle Regression

When bundle size increases unexpectedly, use this process:

1. Compare `next build` output between the current branch and `main`.
2. If the increase is on `/` or `/submit`, check for new imports pulled into `workshop-map.tsx`, `map-panel.tsx`, `submit-form.tsx`, or `location-picker.tsx`.
3. If the increase is on `/admin` or `/admin/login`, that is the most suspicious signal — those pages should never grow by much, since they have no map. A regression there likely means something got imported into `layout.tsx` or a shared `src/lib/` module that admin pages also import.
4. If the increase is in the shared chunk (every route grows equally), check `layout.tsx` and any module under `src/lib/` that many files import (`format.ts`, `validation.ts`).
5. Use `git bisect` with a script that runs `next build` and checks output size to find the offending commit.
6. Once found, review its changes for new imports or dependency additions.

---

### 8. Review Checklist

- [ ] Total first-load JS on `/` and `/submit` (map pages) is under 300kB gzipped
- [ ] Total first-load JS on `/admin` and `/admin/login` is meaningfully lower than the map pages (no Leaflet in that bundle)
- [ ] `react-leaflet`/`leaflet` only appear inside `workshop-map.tsx` and `location-picker.tsx` (or files exclusively imported by them)
- [ ] Both map-bearing components (`WorkshopMap`, `LocationPicker`) still use `next/dynamic(..., { ssr: false })`
- [ ] `leaflet.css` is not imported in `globals.css` or `layout.tsx`
- [ ] `layout.tsx` imports remain minimal: fonts, `SiteHeader`, `SiteFooter`, `globals.css` only
- [ ] No layout import transitively pulls in Leaflet
- [ ] Tailwind v4's `@import "tailwindcss"` CSS-first setup is intact (not reverted to a full/unpurged import)
- [ ] No dependency exceeds 50kB gzipped without justification
- [ ] No duplicate functionality in dependencies (no second map/validation/state library)
- [ ] No devDependency imported in `src/` source code
- [ ] `package.json` contains only the approved dependency set or justified additions

---

### 9. Exit Criteria

The review is complete when:

1. Every item in the checklist above is confirmed PASS or has a filed finding
2. All CRITICAL findings are reported with file path, line number, and fix suggestion
3. All WARNING findings are reported with explanation of risk and remediation
4. A bundle size table is provided showing each route's first-load JS from `next build` output (or estimated from code analysis), explicitly comparing map pages (`/`, `/submit`) against admin pages (`/admin`, `/admin/login`)
5. Every dependency in `package.json` is accounted for with its approximate gzipped size
6. A summary is provided: X critical / Y warning / Z info findings
7. If budget is exceeded, specific reduction recommendations are listed with estimated savings
