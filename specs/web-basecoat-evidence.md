# Web Basecoat refresh — engineering evidence

## Scope and source

- Source: approved `C:/Users/atgpg/AppData/Local/hermes/prompts/tambalban-web-improve-zed.txt`.
- Checkout: `C:/src/tambalban-workspace/tambalban-web`; branch `feat/web-basecoat-refresh`; base `2d9eb8b1d3153986dfe86beac1d8c2661db3cb95` (includes still-open CI PR #1; origin/main at a4aff7a).
- Existing stack: Hono server-rendered strings + HTMX + Tailwind 3.4 + Leaflet; no React. Preserve auth/moderation/data routes and Android/schema.
- No commit, push, PR, tag, release, deployment, remote E2E write, or credential disclosure authorized.

## Acceptance contract

| ID | Required result | Evidence | Status |
|---|---|---|---|
| R1 | Reproducible coverage provider and locked install; real rejecting coverage gate | Checkout npm ci; final Node20 full146tests; 64.02%lines; controlled0%fixture exited1 against55minimum | pass(local) |
| R2 | Exact version, substantive notes, no fallback publication | 13 actual-workflow regressions pass on Node20/25; intended exit/message asserted | pass(local) |
| UI1 | Real Basecoat, reusable typed Hono components, safe HTMX/Leaflet lifecycle, no React/major migration | Official1.0.2 assets/license/SHA manifest; real repeated Edge swaps/cache restore; renderer tests | pass(local) |
| UI2 | Discovery/auth/submission/admin/moderation preserved | 84 local E2E checks +7 populated/authenticated Edge scenarios using real isolated D1/R2 | pass(local) |
| UI3 | Map-first responsive design, shared tokens, keyboard/focus/a11y | DESIGN.md; saved screenshots;50 browser checks at390/768/1440/1920px; axe on5public+4admin surfaces | pass(local) |
| UI4 | Useful reduced motion; runtime/asset costs disclosed | Computed reduced-motion styles pass; no public overflow/page errors/local asset failures; gzip sizes measured | pass(local) |

## Baseline

Executed 2026-10-13 on native Windows, Node v25.5.0: npm ci, npm test (121 tests / 9 files), npm run check, npm run build:css, wrangler deploy --dry-run all passed. npm audit reported 19 existing issues (7 moderate / 12 high); no broad dependency upgrade authorized. Node20.20.2 baseline121/121 also passed.

Baseline real Edge/Playwright screenshots and readings: `C:/Users/atgpg/AppData/Local/hermes/cache/scratch/tambalban-ui-evidence/` (`before-{home,login,submit}-{desktop,mobile}.png`, baseline.json). Isolated LOCAL D1 state only; empty data baseline, no remote database touched. Both viewport sizes had no horizontal overflow or page errors; HTMX and Leaflet loaded. Existing map occupies 70vh below heading/search; results below map, mobile geolocation action absent on discovery.

## Design and uncertainty

Basecoat 1.0.2 package provides official compiled standalone CSS and small component scripts. Inspect cascade/preflight compatibility with existing Tailwind 3 utilities before adopting; consuming generated CSS does not require changing the Tailwind compiler. Only load behavior modules actually used. Native dialog semantics should enforce focus trap/Escape and restore trigger focus. HTMX owns swapped fragments, Leaflet owns map containers; cleanup/init must handle cached DOM as well as new DOM.

## Verification limits

Implementation, local verification and focused independent re-review are complete. The actual verdict passed all six required IDs with no blocking security/logic finding; the verdict validator exited0. Browser tool could not access localhost and Chrome MCP was unavailable; actual local Edge through Playwright was used. Local pass is not hosted CI/production approval. No application commit/push/deploy performed.

## Historical pre-review verification — 2026-10-13

- Clean npm ci in checkout: exit0. Exact Basecoat1.0.2 and V8coverage4.1.10 locked; actual official asset builder wired into dev/build/deploy/CI/release. No React or TW major migration.
- Typecheck: exit0. Full Node20 Vitest coverage:136tests/10files,524/819lines=63.98%, minimum55. No permanent exclusions.
- CI/release regressions:13/13 on Node20 and Node25. Negative tests require the intended failure message, not arbitrary process failure; runner interpreter fixes MSYS/npm PATH shim ambiguity.
- npm run build: exit0. Official assets copied with license/hash manifest; TW3 CSS regenerated.
- Worker dry-run: exit0,2270.22KiB/736.24KiB gzip versus baseline2273.13KiB/736.16KiB. This is NOT deployment.
- Existing E2E against explicit localhost fixture config:84passed/0failed, no auth scenario skipped.
- Edge public responsive/axe/drawer keyboard/swap/cached history/reduced-motion:50passed/0failed.
- Edge populated/authenticated local fixtures:7passed/0failed. Verified-only map/list/search/detail/contact, denied/granted geolocation, injected network-failure retry, actual contributor registration/session/map/photo upload/draft history/server-error retention/submission,4admin pages/axe/filter/pagination/bulk publish with public API readback. Real local D1/R2 responses, not synthesized success.

## Root causes fixed after real browser failures

Public history HTML serialization omitted live input values. Noncredential defaults/checks/options now serialize before caching; passwords/files/tokens/secrets/CSRF are excluded, including password toggled to text. Private pages stay hx-history=false: contributor draft is retained only in live-page memory across boosted navigation, never localStorage/private HTML cache; full navigation/logout clears it.

Pagination sent blank enum filters rejected by existing validation and assumed20 despite server page limits. Empty optional filters are omitted in fetch/HTMX config; starting offset/limit and actual consumed rows drive next page, new filters reset state, and exhausted controls can recover for changed filters. Parent3 RED regressions now pass, and previously failing browser scenarios7/7 pass.

## Persistent artifacts and costs

specs/evidence/web-basecoat/: before/after home mobile+desktop and login mobile, populated map and4admin screenshots, baseline.json, browser-final.json(50checks), browser-fixtures.json(7scenarios), asset-sizes.json. Files ending local-fixtures display synthetic local QA rows, NOT production workshops.

Combined self-hosted CSS+UIJS38251gzip bytes: BasecoatCSS218225raw/21908gzip; officialJS3906raw/1709gzip; customUI29391raw/8689gzip; TW3/appCSS22988raw/5945gzip. Excludes existing HTMX/Leaflet/fonts and baseline inline scripts: not a total-page transfer comparison. Vendor manifest records official SHA hashes. Scratch stores fixture config/state/browser runners/RED logs; fixture tests did not read secret values from .dev.vars.

## Review fixes and current verification — 2026-10-14

Independent review identified H1/H2(high), M3/M4/M5(medium), plus stale evidence(M6) and unused old script strings(M7 low). Five behavioral/spec issues are fixed and each has real Edge regression evidence in review-regressions.json:

- H1: hx-history=false is now on main INSIDE the history element's contents, so HTMX's innerHTML restoration cannot drop the privacy boundary. Admin users→reviews→Back→reviews leaves zero private cache entries. Server session guards remain unchanged.
- H2: manual coordinates are authoritative. Only committed change updates the marker preview, without rewriting entered values; incremental negative/decimal keystrokes remain exact after blur. Explicit map click/geocode can still write coordinates.
- M3: admin form and inherited selectors share hx-sync=closest form:replace. Filter XHR ownership rejects stale swaps; load-more is blocked while filtering and uses the last committed dataset's parameters, not unapplied edits. A delayed REAL response cannot overwrite newer results; pagination has no duplicate IDs.
- M4: photo upload belongs to the contributor form, independently of a loaded Leaflet picker. Replacing/detaching that form aborts its upload. Actual local R2 upload and image readback pass while Leaflet JS is blocked.
- M5: action/focus/selection accent is emerald #047857 as required by the prompt. Existing purple logo/icon identity stays unchanged. Basecoat variables, legacy utility tokens and DESIGN.md agree; automated contrast checks pass.

Current final results supersede historical metrics above:146tests/11files on Node20 and native Node25;525/820lines=64.02%;13CI/release regression checks;84localE2E;50responsive/public browser checks;7populated/authenticated scenarios;5review-specific browser regressions. All passed; no required scenario skipped. Typecheck/build pass. Worker dry-run2270.29KiB/736.27KiB gzip, NOT a deployment.

Screenshots and JSON were refreshed after review fixes. final-metrics.json records counts/coverage/asset bytes; combined CSS+UIJS38694gzip bytes. Official assets are unchanged; appCSS23053raw/5963gzip, customUI31320raw/9114gzip. Private test credentials went only to localhost APIs; no production credentials read. Evidence data is explicitly synthetic/local.

Focused independent re-review: PASS for R1/R2/UI1/UI2/UI3/UI4, no blocking security/logic findings and no unverified acceptance ID. Actual validated verdict is preserved in specs/evidence/web-basecoat/independent-review-final.json. Reviewer independently reran25view/privacy tests and13CI/release regressions, verified official asset hashes/coverage/gzip counts, and checked five public surfaces at360px in real Edge. Application commit/push/deploy remains unauthorized/not performed.

## Remaining limits

## Publication follow-up — 2026-10-14

User subsequently authorized completing publication and providing the live website. Prepared v0.2.0 with matching substantive CHANGELOG. Production preparation also fixed the Lighthouse sibling workflow: npm ci, full official UI asset build, disposable LOCAL D1 initialization and explicit local server. New regression failed before the fix and passed afterward; CI/release suite is now14checks, application suite remains146/64.02%. Hosted CI/merge/deploy/release and live verification are pending at this commit; earlier non-publication statements describe the historical local-only checkpoint, not current permission.

### Residual limits

Hosted CI first exposed a real npm10/npm11 lockfile difference: Vite8's optional esbuild peer was incompatible with Wrangler's root esbuild0.17, while npm11's Windows-generated lock omitted the nested peer. The exact Node20/npm10 npm-ci dry-run reproduced EUSAGE; npm10 package-lock-only regeneration added the missing nested esbuild0.28.2/platform metadata without upgrading existing packages. The same npm10 clean-install validator then passed. Publication remains gated on hosted rerun, not the earlier Windows-only install claim.

GitHub/Linux CI, real tag/release/publication and production sessions not run. npm audit20issues(8moderate/12high), baseline19; no forced unrelated upgrade. Wrangler3/Browserslist warnings remain. Manual screen-reader/physical-device checks unverified. Old unused inline-script constants(M7 low) remain in source but are not injected/executed; public/ui.js is the sole app runtime. Independent review explicitly treats these disclosed limitations as nonblocking within the approved local acceptance scope.
