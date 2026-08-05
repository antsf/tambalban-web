---
name: map-ux-reviewer
description: UX review of TambalBan Web's map, submit flow, and admin dashboard through the emergency-use lens — popup completeness, empty-viewport handling, no-voting model.
---

# map-ux-reviewer

UX review expertise for map interactions in TambalBan Web, with a single organizing lens: **the person using this is often stranded with a flat tire, at night, with weak signal.**

## When to Use

Activate this skill when reviewing or building: the public map (`workshop-map.tsx`, `map-panel.tsx`), the submission flow (`submit-form.tsx`, `location-picker.tsx`), the admin review dashboard, mobile responsiveness of any of these, loading states, or any user-facing map feature.

## The Emergency-Use Lens (read `soul.md` first)

> "A flat tire always happens at the wrong time — at night, on a toll road, somewhere the signal is weak. A stranded driver needs exactly one thing, fast: the nearest tire repair shop that is actually open and actually there."

This site is not the surface a stranded driver directly uses — that's the Android app. But every UX decision here is downstream of that reality in two ways:

1. **Data quality over speed.** Every contributor flow (submit form, admin review) exists to feed data that someone will later rely on in an emergency. A confusing submit form that produces bad addresses, or an admin dashboard so tedious that review lags, both degrade what the stranded driver eventually sees.
2. **The contributor is often also on the road.** Shop owners registering their business, or a passerby who just spotted a workshop, are frequently on a phone, possibly on a spotty connection, possibly in a hurry. The submit flow should assume the same constraints as the emergency-use case, even though it isn't itself the emergency screen.

Every review question in this skill reduces to: **does this help a real, currently-open workshop get found faster and more reliably by someone who needs one?**

## No Detail Page — The Popup Is the Whole Story

Unlike map projects with a `/point/[id]` or `/workshop/[id]` detail page, **this project has none.** `workshop-map.tsx`'s Leaflet popup is the entire disclosure surface: name, address, hours (`formatHours()`), rating if any, and a `tel:` "Telepon" button.

### Why this matters for review

- There is no "Lihat Detail" click-through to fall back on. If the popup omits something a driver needs (phone number, whether it's open now), there's nowhere else to find it on this site.
- The call-to-action inside the popup (`tel:` link) is the single most emergency-critical UI element in the whole app. It must always be present when `phone` is non-null, must format correctly (`telHref()` in `src/lib/format.ts` strips non-digit characters), and must be reachable with one tap on a small screen.
- Popup content must stay lean enough to render fast and read fast — but "lean" here does NOT mean "defer detail to another page," because that page doesn't exist. It means: show exactly what's needed, nothing more, in the popup itself.

### Popup Review Checklist

- [ ] Name, address, hours, and (if present) phone/call button are all in the popup — nothing essential is missing because "it's on the detail page" (there isn't one)
- [ ] The call button is a real `tel:` link, not just displayed text
- [ ] Popup width (`min-w-52`, Tailwind ~13rem) doesn't overflow a 375px screen
- [ ] `formatHours()` output is unambiguous — "Buka 24 jam" vs "HH:MM – HH:MM" vs the "Jam buka tidak diketahui" fallback should never look like an error

## Indonesia Bounds, Viewport-Bounded Data

`getWorkshopsInBounds` (`src/lib/geo.ts`) only ever returns workshops inside the currently visible viewport, capped at `VIEWPORT_LIMIT = 300`. This has a UX consequence worth checking:

- **A zoomed-out view (whole-Indonesia scale) can silently truncate at 300 rows**, ordered by `rating_count desc`. That means at low zoom, workshops with zero ratings (which, early on, is most of them, since ratings come from the Android app) can be crowded out by whatever happens to have reviews. Check whether this creates a "the map looks sparse even though data exists" impression at low zoom, and whether that matters given `soul.md`'s framing that the map should not look abandoned.
- There is currently **no marker clustering** (see `leaflet-expert`) — at very dense pin areas (rare, given the 300 cap and current scale) markers may overlap. Not a blocking issue at current data volumes; note it as a Later-horizon concern only if it becomes a real problem.

## The Empty Map Problem

Before enough workshops exist in a region, a visitor may pan to their area and see nothing.

**Check for:**

1. **Some indication of why it's empty**, not just a silent blank map. `workshop-map.tsx` shows a small `card-brutal` badge with either `"Memuat…"` (loading) or `"N tambal ban di layar"` (count) — verify it correctly shows `"0 tambal ban di layar"` rather than looking broken or stuck loading when a viewport genuinely has zero results.
2. **A path to contribute** — the "+ Tambah Tambal Ban" link is in the header on every page (`site-header.tsx` and the map page's own CTA in `page.tsx`), so a visitor seeing an empty viewport is never more than one tap from `/submit`. Verify this stays true; don't let a future redesign bury the add-workshop CTA below the fold on mobile.

## Submit Flow UX

The current implementation (`submit-form.tsx` + `location-picker.tsx`) is a two-column form (`grid gap-6 lg:grid-cols-2` — stacks to one column below `lg`): location column first, then shop-detail column. Review against this actual flow, not a generic "map-click-to-drop-pin wizard":

1. **Three ways to place the pin**, all converging on `moveTo(lat, lng)`:
   - Search by place name (`/api/geocode?q=`, forward geocode, Indonesia-only via `countrycodes=id`)
   - "Pakai lokasi saya" (browser geolocation)
   - Click the map or drag the marker directly (`location-picker.tsx`)
2. **Reverse-geocode auto-fill**: after any pin move, a 700ms-debounced call to `/api/geocode?lat=&lng=` tries to fill the address field — but only until the user manually edits the address themselves (`addressTouched` flag). This is a convenience, not a requirement; confirm the UI never blocks submission on geocoding succeeding (it shouldn't — the code already treats a failed reverse-geocode as silent/non-blocking).
3. **Lat/lng are also directly editable** as number inputs, which is a deliberate escape hatch for precision — useful for someone who knows the exact coordinates and doesn't trust the pin. Don't "simplify" this away.
4. **Client-side Indonesia bounds check** (`inIndonesia()`) runs before submit, mirroring the server-side Zod check — this gives instant feedback instead of a round-trip failure. Verify the error message ("Titik lokasi di luar wilayah Indonesia") stays close to the map/coordinate fields, not detached at the top of the page.
5. **On success**, the form replaces itself with a confirmation card explaining the submission is queued for admin review and will appear "di peta ini dan di aplikasi TambalBan" once approved — this is the moment to set the right expectation that review is admin-gated, not instant and not community-voted (see below).

### Mobile Submit Considerations

- The form is a stacked single column below `lg` — the map card (`h-72` fixed height picker) and the detail fields are sequential, not overlapping, so nothing needs a bottom-sheet pattern. Verify the `h-72` map height stays tall enough to comfortably drag a pin on a small screen (not so short that fine adjustment is fiddly).
- Required fields (name, phone, address) use native `required`/`minLength`/`maxLength` — verify keyboard types are correct: `type="tel"` for phone (already used), and that number inputs for lat/lng don't awkwardly bring up a full numeric keypad that hides the map on small screens at the wrong moment.

## No Community Voting — Review Is Admin-Only, and That's Deliberate

This is the single biggest UX difference from a typical crowdsourced map, and it must shape every review of the moderation surface.

`soul.md`: *"Unlike community maps that lean on mass voting, every submission here is checked one by one before going public. The reason is simple: the person opening this map is usually in the middle of an emergency."*

Consequences for UX review:

- **There is no public `/pending` page, no vote buttons, no "3 upvotes to approve" progress bar anywhere in the public UI.** Do not import UX patterns from vote-based crowd maps (progress indicators, "help verify this" community framing) — they don't apply and would misrepresent how this project actually works.
- **`/admin` and `/admin/login` are the entire review surface**, gated by a shared password (`ADMIN_PASSWORD` + signed `tb_admin` cookie, see `security-review`). `admin-dashboard.tsx` shows three tabs (Menunggu/Disetujui/Ditolak) with Setuju/Tolak buttons per pending row. Review this the way you'd review any internal tool: is it fast for a single moderator to work through a queue? Are approve/reject unambiguous and hard to mis-click? (Currently: distinct colors — `bg-ok` green for Setuju, `bg-danger` red for Tolak — and per-row `busyId` disabling during the request.)
- **The submitter has no way to check their own submission's status** after leaving the confirmation screen (no lookup, no email, no account). This is a known, accepted gap for v1 — don't flag it as a bug, but it's fair to note as a Later-horizon UX idea if raised (see `roadmap-planner` for how to evaluate that against `soul.md`).

## Loading States

### While Fetching Workshops (viewport re-fetch)

- The map stays interactive during fetch — no full-screen spinner. `workshop-map.tsx`'s badge overlay shows "Memuat…" as an unobtrusive corner indicator, not a blocking modal. Verify this stays true.
- Verify old markers persist visually until new ones replace them (no flash-to-empty on every pan) — check whether `setWorkshops(json.workshops)` causes a visible flicker; if it does, that's worth flagging even though it's a minor detail, because repeated flicker while panning to find a workshop is exactly the kind of friction that matters in a hurry.

### Initial Page Load

- `map-panel.tsx`'s dynamic-import loading state (`bg-[#dcd6c8]` + "Memuat peta…") covers the gap between page load and Leaflet mounting — verify it's still wired correctly after any refactor.

### Error States

- `workshop-map.tsx` surfaces fetch errors inline (`card-brutal bg-danger` badge) rather than silently failing — verify the message is actionable, not just "Error." Same pattern in `submit-form.tsx` and `admin-dashboard.tsx` for their respective failure states. None of these currently offer an explicit retry button — check whether that's worth adding, particularly for the map (a driver's contributor spotting a workshop on a bad connection shouldn't have to reload the whole page to retry a failed fetch).

## Anti-Patterns to Catch in Review

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Popup omits phone/hours "because it's minor" | There's no detail page — omitted info is just gone | Keep popup content complete; see Popup Review Checklist above |
| Call button styled as plain text, not a `tel:` link | Extra friction exactly when speed matters most | Always render `<a href={telHref(phone)}>` |
| Full-screen spinner over the map on viewport fetch | Map feels broken; blocks panning while someone is trying to find a workshop | Small corner indicator only, keep map interactive |
| Clearing all markers before new ones load | Jarring flash while panning to search an area | Keep old markers until new data replaces them |
| Adding vote counts/"help verify" UI to any public page | This project doesn't have a voting model — misrepresents how review works | Admin-only review; if genuinely proposing a change to this, that's an architectural decision, not a UX tweak (see `CLAUDE.md` rule 3) |
| Submit button below the fold, or buried after optional fields | Delays the two things that matter most: pin placement and shop name | Location column first (already the case) — don't reorder to bury it |
| No feedback that a submission is "pending," implying it's already live | Contributor thinks the workshop is instantly visible; may not realize it needs review | Confirmation screen must explicitly say it's queued for review (already does — keep it) |
| Map without any empty-viewport messaging | New/sparse regions look like the site is broken | Loading/count badge must handle zero-result state clearly |

## Accessibility

Leaflet maps are inherently hard for screen readers. This project has **no alternative list view** of workshops (unlike a project with a `/pending` list) — the map is the only browsing surface on the public site. Points worth checking:

- `/api/workshops?q=<name>` supports name search server-side (per `SPEC.md` §4.1), but confirm whether the current UI (`page.tsx`) actually exposes a search input, or whether search is presently API-only. If there's no UI for it, that's a real accessibility and usability gap worth flagging — it would be the natural non-map way to find a workshop.
- ARIA labels on map controls (zoom buttons) come from Leaflet defaults — verify the neo-brutalist CSS overrides (`globals.css` `.leaflet-control-zoom a`) didn't strip any accessible name in the process of restyling.
- Admin dashboard tabs and buttons use real `<button>` elements with visible text labels — good baseline keyboard/screen-reader support; verify tab switching doesn't require a mouse-only interaction.

## UX Checklist Before Shipping a Map-Related Change

- [ ] Map loads without error on mobile (375px) and desktop
- [ ] Popup contains everything an emergency user needs — no missing info deferred to a nonexistent detail page
- [ ] Call button is a working `tel:` link when phone exists
- [ ] Draggable/click-to-move pin works reliably via touch
- [ ] Empty viewport shows a clear state, not silence
- [ ] Submit flow's three pin-placement methods (search, geolocation, map interaction) all converge correctly
- [ ] Reverse-geocode address autofill never blocks submission if it fails
- [ ] Indonesia bounds check gives instant client-side feedback before hitting the server
- [ ] Post-submit confirmation clearly states the submission needs admin review, is not live yet
- [ ] Admin dashboard approve/reject is unambiguous and hard to mis-click
- [ ] Loading states are non-blocking (map stays interactive during fetch)
- [ ] Old markers persist until new ones load (no flash-clear on pan)
- [ ] Error states show a specific message, ideally with a retry path
- [ ] No horizontal scroll on any mobile viewport

## Exit Criteria

The UX review is complete when:

1. A first-time visitor on mobile can, within seconds: see the map, understand what it's for, and find the "+ Tambah" contribution path.
2. Pin discovery works end-to-end: pan/zoom -> see marker -> tap -> popup has everything needed to call the shop, with no dead-end expecting a detail page.
3. Submit flow works end-to-end on mobile: place pin (any of the three methods) -> fill form -> submit -> see a confirmation that correctly sets expectations about admin review.
4. No UI anywhere implies a community-voting review model that doesn't exist in this project.
5. No loading state leaves the user staring at a blank or frozen screen.
6. Every popup and confirmation message correctly reflects that this data feeds an emergency-use tool downstream — accuracy and clarity win over cleverness.
