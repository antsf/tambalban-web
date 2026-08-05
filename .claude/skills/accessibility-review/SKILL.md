---
name: accessibility-review
description: Accessibility review for TambalBan Web's react-leaflet map, submit form, and admin dashboard — keyboard nav, focus management, ARIA, color contrast, the missing non-map alternative gap.
---

# accessibility-review

Accessibility review for TambalBan Web, tailored to the specific constraints of a `react-leaflet`-based roadside-emergency map application.

## When to use

Run this skill when reviewing any PR that touches components, forms, navigation, or ARIA attributes. Also run before any release milestone.

## Instructions

You are reviewing the accessibility of a Next.js map app whose entire purpose is helping someone find help fast — often at night, on the roadside, possibly on an old Android phone. The key constraint: **the Leaflet map is inherently inaccessible** for keyboard and screen reader users (this applies to `workshop-map.tsx`, loaded via `map-panel.tsx` with `next/dynamic({ ssr: false })`, and to `location-picker.tsx` on the submit form).

Unlike a project that ships a fully accessible list-view alternative to its map, **TambalBan Web currently has no such alternative** — there is no `/workshops` list page, no `/workshop/[id]` detail page. `GET /api/workshops?q=` (name search) exists as an API capability per SPEC.md §4.1, but nothing in `src/app/page.tsx` or `src/components/workshop-map.tsx` currently exposes it as a UI a keyboard/screen-reader user could operate. **Treat this as an open gap, not a mitigated one.** Flag it and recommend a minimal accessible alternative (e.g., a text search box wired to `?q=` that renders results as a real HTML list with links/buttons, rendered outside the map canvas) rather than assuming one exists.

Work through every section below. For each item, read the relevant source files, report PASS or FAIL, and provide a concrete fix when failing.

### 1. Keyboard navigation

Test these keyboard flows by reading the component structure:

- **`/` (map page, `src/app/page.tsx` + `workshop-map.tsx`)**: Is there anything on this page reachable and operable without a mouse besides the "+ Tambah Tambal Ban" link? If the only way to find a workshop is clicking a map marker, keyboard/screen-reader users have zero path to the data. This is the biggest gap to flag.
- **`/submit` form (`submit-form.tsx`)**: Can a keyboard user Tab through name, phone, address, 24h checkbox, open/close time, notes, and submit with Enter? The map pin-drop (`location-picker.tsx`) is mouse/touch-only (click-to-move, drag marker) — but the form **already has a working alternative**: the Latitude/Longitude number inputs directly below the map (`submit-form.tsx` lines ~229-250). Verify these are real, labelled, keyboard-operable `<input type="number">` elements (they are) and are not visually or programmatically hidden.
- **`/admin` (`admin-dashboard.tsx`)**: Can a keyboard user Tab through the status tabs (Menunggu/Disetujui/Ditolak), then through each submission's Setujui/Tolak buttons, in a logical order?
- **`/admin/login`**: Can a keyboard user reach the password field and submit with Enter? (It already uses `autoFocus` — verify this doesn't fight screen reader announcement on route entry.)
- **Header nav (`site-header.tsx`)**: Can a keyboard user Tab through "Peta" and "+ Tambah" links?

### 2. Focus management

- **After form submission**: `SubmitForm`'s success state (`doneId` set) replaces the entire form with a confirmation card ("Terkirim!"). Focus must move into that card (e.g., onto its heading) — it must not silently stay on a submit button that no longer exists in the DOM, and must not silently reset to the top of the page.
- **After admin review action**: When `review(id, "approve"|"reject")` in `admin-dashboard.tsx` removes a submission from the list, focus must move to a sensible place (next item, or a status message) — not disappear into a removed DOM node.
- **Route changes**: After navigating `/admin/login` → `/admin` (via `router.replace` + `router.refresh`), focus should land on the page heading ("Review Kiriman"), not silently stay wherever it was.

### 3. ARIA attributes

Check these specific requirements:

- `admin-dashboard.tsx` tab buttons (Menunggu/Disetujui/Ditolak): should use `role="tab"` / `aria-selected`, or at minimum `aria-current="true"` on the active tab. Currently they are plain `<button>` elements distinguished only by `bg-brand` vs `bg-white` — verify the active tab is also announced to screen readers, not just visually distinct.
- Setujui/Tolak buttons: verify `aria-label` includes the workshop name when multiple cards are on screen (e.g., `aria-label="Setujui Tambal Ban Pak Budi"`), since "Setujui" alone is ambiguous when repeated in a list.
- `SubmitForm`'s "Pakai lokasi saya" (`useMyLocation`) button: verify it communicates outcome (error state `setError(...)`) to assistive tech — check that the error message region is a live region (`aria-live="polite"`) so a screen reader announces geolocation failures without requiring the user to hunt for them.
- `workshop-map.tsx`'s status overlay (`{loading ? "Memuat…" : ...}` / error banner): this is the only indicator of load state and errors — verify it is in an `aria-live` region so a screen reader user knows a search/pan just happened, since they cannot see the map update.
- The search-result / geocode-result list in `submit-form.tsx` (`placeResults`, rendered as a `<ul>` of `<button>`s): this is a reasonable accessible pattern already — verify each button's accessible name is the full `label` text, not truncated.

### 4. Color is not the only indicator

- **Workshop pin color** (`workshop-map.tsx`, `pinIcon()`): pins are colored `#00A651` (green, 24h) vs `#0057FF` (blue, limited hours) with **no text difference** — this distinction only exists inside the popup (`formatHours()`), which requires clicking the pin. A color-blind user viewing the map itself cannot tell 24h shops from limited-hours shops before clicking. This is a real, checkable finding — flag it if the popup remains the only place hours are surfaced as text.
- Admin dashboard status tabs: the active tab is distinguished by `bg-brand` (yellow) vs `bg-white` only — no icon, no `aria-selected` (see §3). Flag if no non-color signal is added.
- Error states (`bg-danger` red banners) already pair color with text (the error message itself) — verify this stays true for every error surface (submit form, admin dashboard, login page, map overlay).

### 5. Image accessibility

**Not applicable in this project.** TambalBan Web has no photo upload feature (out of scope per SPEC.md §10, CLAUDE.md). Do not flag missing `alt` text on workshop photos — there are none. The only images are the "TB" logo mark in `site-header.tsx` (a styled `<span>`, not an `<img>` — verify it doesn't need `alt`) and Leaflet's tile imagery (decorative background, no `alt` needed).

### 6. Language attribute

- `src/app/layout.tsx` hardcodes `<html lang="id">`. This project has **no i18n system, no language toggle** — all user-facing text is Indonesian, hardcoded inline in components. Verify `lang="id"` stays hardcoded and correct; do not flag it as "should be dynamic" (there is nothing to switch between). Flag only if a component ever renders English text without its own `lang="en"` span (should not normally happen — API error messages, coordinates, and IDs are the only non-Indonesian-prose content, and those are fine as `lang="id"` inherited).

### 7. Form accessibility

Review `SubmitForm` and the admin login form:

- Every `<input>`/`<textarea>` in `submit-form.tsx` should already be wrapped in a `<label>` (they are, via `<label className="block text-xs font-black uppercase">Nama tambal ban * <input .../></label>` pattern) — verify this pattern holds for every field, including the Latitude/Longitude number inputs and the 24h checkbox.
- Required fields (`name`, `phone`, `address`) use the HTML `required` attribute — verify this matches `submissionSchema` in `src/lib/validation.ts` (name min 3, phone min 7 digits + pattern, address min 10 chars). If Zod requires something HTML validation doesn't enforce (e.g., the phone regex `^[0-9+\-\s()]+$`), the server-side 400 error must be surfced accessibly (see the error banner in §3/§4) rather than silently rejecting.
- Error messages returned from the API (`json.error`) render in a single banner, not per-field. Because Zod validation errors (`parsed.error.issues`) are field-specific, consider whether the banner text is specific enough for a screen reader user to know which field to fix, or whether it's a generic "Data tidak valid" that leaves them guessing. Flag if so.
- Autocomplete attributes: `name`, `phone` fields would benefit from `autoComplete="organization"` / `autoComplete="tel"` — check if present, flag as a minor improvement if missing.

### 8. Skip navigation

- Check `src/app/layout.tsx` and `site-header.tsx` for a "Skip to main content" link as the first focusable element. **None currently exists.** Flag this as missing on every page, with a concrete fix: add `<a href="#main-content" class="sr-only focus:not-sr-only ...">Langsung ke konten utama</a>` as the first child of `<body>`, and add `id="main-content" tabIndex={-1}` to the `<main>` wrapper in `layout.tsx`.
- On `/` specifically, a "Skip to map" link is lower priority than fixing the underlying lack of a non-map alternative (see the intro) — note this but don't let it substitute for the real fix.

### 9. What NOT to flag

Do not flag or attempt to fix:
- Leaflet map canvas keyboard accessibility itself (acknowledged limitation — `react-leaflet`'s `MapContainer`/`Marker`/`Popup` are not keyboard-operable by design)
- Map marker keyboard interaction (acknowledged limitation)
- Leaflet's built-in zoom control keyboard support (it provides this natively; styled via `.leaflet-control-zoom a` in `globals.css`)
- Adding `role="button"` to elements that are already `<button>` elements
- The neo-brutalist visual style itself (thick borders, hard shadows, uppercase text) — that's a design-system-review / design-director concern, not an accessibility one, unless it demonstrably breaks contrast (check `--color-ink` #111111 on `--color-paper` #fff7e6, `--color-brand` #ffd400, `--color-accent` #0057ff, `--color-danger` #e4002b, `--color-ok` #00a651 against their typical backgrounds — most pass AA at this weight/size, but verify white text on `--color-accent`/`--color-danger`/`--color-ok` specifically)

## Review output format

```
## Accessibility Review — [date]

### Summary
X passes, Y failures, Z warnings

### Acknowledged limitations
- Leaflet map canvas (workshop-map.tsx, location-picker.tsx) is not keyboard-accessible. Partial mitigation: submit-form.tsx already offers Latitude/Longitude number inputs as a working keyboard alternative to pin-drop.

### Open gaps (not yet mitigated — flag even if "by design" elsewhere)
- No accessible, non-map way to browse or search workshops on `/`.

### Findings
| # | Check | Status | File:Line | Detail |
|---|-------|--------|-----------|--------|
| 1 | Keyboard nav — / | PASS/FAIL | ... | ... |
...

### Required fixes (blocking)
1. ...

### Recommended improvements (non-blocking)
1. ...
```

## Exit criteria

The review is complete when:
- Every section of the checklist has been evaluated with PASS or FAIL
- Every FAIL has a concrete, actionable fix with code example
- The lack of a non-map accessible alternative has been explicitly assessed (not assumed away)
- The 24h/limited-hours pin color-only distinction has been checked
- Skip-navigation has been verified against the actual `layout.tsx`
- Form accessibility has been verified field-by-field against `submissionSchema`
- No photo-related accessibility items are raised (this project has no photos)
- The review output table is filled in completely
