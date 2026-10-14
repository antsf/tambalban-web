# TambalBan Web — Design System

**Version:** 1.0 (Basecoat refresh)

**Primary surface:** Explore / peta bengkel

**Stack:** Hono-rendered HTML strings, HTMX 2, Leaflet 1.9.4, Basecoat CSS **1.0.2**, existing Tailwind **3.4** compiler. No React and no Tailwind compiler migration.

## Product intent and visual atmosphere

A field-map product for finding tyre repair in Indonesia. The map and actual workshop information are the product, not a marketing hero. Use a calm light canvas, white functional surfaces, clear borders, and one emerald action accent as specified by the approved prompt. The existing purple logo/icon identity remains unchanged; it is not a competing action theme. The heading is concise: “Cari tambal ban.” Results, location, contact and contribution are directly reachable.

Do not manufacture distance, current availability, star ratings, urgency, business hours or map data. An empty local database is an honest empty state, not permission to populate the UI with invented workshops. Show “Jam tercatat” only for a real stored value; always recommend direct confirmation.

## Colors and semantic tokens

| Token | Value | Role |
|---|---|---|
| `--primary` | `#047857` | Approved emerald primary actions |
| `--primary-foreground` | `#FFFFFF` | Text on primary actions |
| `--background` | `#F8F9FA` | Page canvas |
| `--foreground` | `#191C1D` | Main text |
| `--card`, `--popover` | `#FFFFFF` | Results, forms, drawer and overlays |
| `--muted` | `#F3F4F5` | Quiet service labels and secondary surfaces |
| `--muted-foreground` | `#55565A` | Body hints; darker than inherited Android small text |
| `--secondary` | `#F3F4F5` | Neutral secondary surfaces |
| `--accent` | `#D1FAE5` | Current navigation and selected result tint |
| `--secondary-foreground` | `#454748` | Text on neutral surfaces |
| `--accent-foreground` | `#064E3B` | Text on emerald-tinted surfaces |
| `--border`, `--input` | `#DADCE0` | Neutral structural boundaries |
| `--destructive` | `#B3261E` | Destructive moderation actions |
| `--ring` | `#047857` | Keyboard focus |
| notice error | `#F9DEDC` / `#641711` | Error container/text |
| notice success | `#D1E8D1` / `#1A3E1A` | Success container/text |

Links use `#047857` on light surfaces. Use border/background/labels, not color alone, to identify selected results, active navigation or errors. The marker key is blue because the real Leaflet default markers are blue; do not mislabel their color as the action accent.

## Typography

- UI and body: Segoe UI / system sans-serif; remains usable with external font requests blocked.
- Display headings: Barlow Condensed with Segoe UI fallback. Existing admin typography may retain Barlow / IBM Plex Mono tokens for its established data layouts.
- Main discovery heading: 34 px desktop, 30 px narrow screens; 1.12 line-height, -0.025em tracking, weight 700.
- Body: 16 px / 1.5. Supporting description: 15 px. Controls and navigation: 14 px. Hints: 12 px. Tiny attribution is non-actionable secondary text.
- Never put essential information exclusively in a low-contrast placeholder.

## Shape, spacing and elevation

`--radius: 0.75rem` (12 px); nav items 8 px. Major spacing follows 4 / 8 / 12 / 16 / 20 / 24 / 32 px. Surface boundaries use a 1 px neutral border. Avoid decorative cards around every line. Elevation is reserved for the modal drawer and transient toast region. No gradients or new logo identity; emerald is reserved for the approved web action accent.

## Layout and responsive behavior

- Shared shell: sticky header (68 px desktop / 60 px narrow), main landmark, status/toast region and modest footer. Maximum content width 1240 px; 24 px desktop gutters / 16 px mobile.
- Desktop discovery: flexible map + 350 px results column, 20 px gap. Map height is clamped between 440 and 700 px at 64 vh; results list scrolls within the same height.
- Below 960 px: one column; map remains first, results follow in normal document flow. Map uses a 300–500 px clamp at 48 svh. The “Lihat daftar” anchor makes the list reachable without relying on panning the map.
- Below 540 px: full-width labeled search; location and results actions share the next row. Typing is debounced; Enter submits immediately. No horizontal overflow should be accepted.
- Contributor forms retain required fields, service names, Indonesia coordinate bounds, geocoding, photo upload and JSON submission routes. Auth cards have a 420 px maximum width.
- Admin data retains filtering, publication/removal, selection and pagination. Filter fragments replace the stable `#data-list`, not its containing controls.

## Reusable component contract

`src/views/components.ts` owns typed button, card, page-heading, navigation-link, field, checkbox, notice and drawer renderers. User values pass through `src/views/escape.ts` at HTML boundaries. Composed HTML bodies are authored strings, not user strings. Keep helpers small; no rendering DSL. `layout.ts` re-exports field/checkbox/escape to preserve existing view contracts.

Use actual Basecoat classes (`btn`, `card`, `input`, `checkbox`, `alert`, `badge`, `drawer`) and its supported `data-variant` API. The mobile navigation is a native modal `<dialog>` with Basecoat drawer animation and lifecycle cleanup. It is not a hand-rolled off-screen div.

## CSS coexistence and asset provenance

The build helper `worker/scripts/build-ui.mjs` requires exact `basecoat-css@1.0.2`, copies the official compiled CDN stylesheet, core JS, drawer JS and MIT license into `public/vendor/basecoat/1.0.2`, and writes byte sizes and SHA-256 hashes to a deterministic manifest. It does not recompile or imitate Basecoat. Do not load `all.js`.

Layer order is declared **before** the official stylesheet: `theme, base, legacy, components, utilities`. Existing TW3 output lives in `legacy`; Basecoat component rules beat old preflight, while old admin utilities still beat Basecoat base rules. The compiled application stylesheet loads **after** Basecoat so its unlayered semantic token overrides beat the package's unlayered default `:root`. CSS ordering has a regression test; computed cascade remains a real-browser QA requirement.

## Interaction, lifecycle and motion

- One deferred `public/ui.js` installation uses delegated listeners. It owns Leaflet instances in a DOM-keyed map and initializes a preserved container only once.
- HTMX links swap `#page-shell`; forms retain their independent JSON extensions and toast/fragment targets. Page-selection attributes are deliberately not inherited by forms.
- Destroy maps only when the swap replaces their actual containers. Abort pending requests, invalidate response sequences, disconnect resize observers and remove Leaflet instances before replacement.
- Before history serialization, store center/zoom/selection as data, remove Leaflet-managed DOM, then remount any still-connected live container. Restored Basecoat cached nodes get `initAll({ force: true })`; copied initialization flags are not a live instance.
- Authenticated/admin and auth-form pages put hx-history=false on main inside the history element's contents: HTMX restores innerHTML, not root attributes. Never serialize secrets or persisted password values. Contributor drafts use live-page memory only, cleared on full navigation/logout.
- Searches check HTTP status, abort old requests immediately when intent changes, and reject stale results even if a transport ignores abort. Explicit loading, empty, network, tile and location-denial states replace silent failures.
- Location requires user action, never automatic geolocation. Device positions are approximate, not business-distance evidence.
- Map/list selection is linked with a selected state and marker popup. Contacts use stored data; website schemes are restricted to HTTP(S).
- Motion explains state: 160 ms toast entrance, 140 ms result selection, 180 ms drawer transition, a small loading pulse. Leaflet pan animation is disabled when reduced motion is requested. All CSS motion and smooth scrolling obey `prefers-reduced-motion`.

## Accessibility and verification

Skip link, main landmark, labeled search, explicit label/hint associations, keyboard-operable buttons, `aria-current`, live status regions, retry actions and a visible 3 px focus outline are required. Dialog open updates `aria-expanded`; native modal focus containment and Escape are preserved; close restores trigger focus. Touch action controls have at least 44 px height; desktop result contacts remain compact links.

Automated Vitest regression tests cover shared markup, escaping, route/JSON contracts, moderation surfaces, CSS order, idempotent maps, unrelated fragment swaps, actual replacement cleanup, forced history reinitialization, stale search/abort and HTTP errors. These boundary tests do **not** prove browser focus, computed contrast, real Leaflet tile behavior or mobile scrolling. Final local Edge/Playwright QA must verify drawer Tab/Shift-Tab/Escape/focus after repeated swaps and back/forward, map resize/cleanup, reduced motion, populated/empty/error results, submission and moderation flows, axe findings and desktop/mobile overflow.

## Do / do not

- Do keep actions adjacent to real workshop data and preserve all moderation/auth invariants.
- Do use clear Indonesian copy, explicit retry and accurate “belum tersedia” states.
- Do preserve working admin layout and names rather than imposing a dashboard rewrite.
- Do not inject user HTML, render untrusted website schemes, duplicate global script declarations or cache active Leaflet DOM.
- Do not ship without generated official assets, or claim final browser acceptance from string tests alone.
