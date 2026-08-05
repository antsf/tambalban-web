---
name: react-performance
description: React performance guidance for TambalBan Web — where it actually matters (WorkshopMap), the debounce+abort viewport pattern, useMemo for markers, anti-patterns to reject.
---

# react-performance

Performance optimization skill specific to TambalBan Web.

## Activation

Use this skill when reviewing or implementing performance-related code in this app, or when a component re-renders too often or the UI feels sluggish.

---

## Where Performance Actually Matters

### `WorkshopMap` is the ONLY hot path

`src/components/workshop-map.tsx` re-renders on every pan/zoom because it manages the `workshops` state array and reacts to viewport changes via `useMapEvents`. Every other component in this app renders infrequently and handles small data.

### Components that need ZERO performance work

- `site-header.tsx`, `site-footer.tsx` — static markup, server components, render once.
- `location-picker.tsx` — a single draggable marker, not a list.
- `admin-dashboard.tsx` — at most 200 rows (the `.limit(200)` in `GET /api/admin/submissions`), and only visible to one moderator at a time behind a password. Not a bottleneck.
- `submit-form.tsx` — a handful of controlled inputs plus a max-5-result geocode dropdown.

**Do not add `React.memo`, `useMemo`, or `useCallback` to these components.** It adds complexity with zero measurable benefit.

---

## No Marker Clustering (and Why That's Fine Here)

Unlike a project with tens of thousands of pins, this project's public-map query (`getWorkshopsInBounds`, `src/lib/geo.ts`) is capped at `VIEWPORT_LIMIT = 300` and is viewport-bounded to begin with — the client only ever renders markers currently on screen, not the whole dataset. There is no `leaflet.markercluster`/`react-leaflet-cluster` dependency in `package.json`, and none should be added speculatively. If a future review finds a specific viewport genuinely rendering hundreds of overlapping markers in a dense area, that's worth revisiting — but it isn't the current reality, and adding a clustering library "just in case" is exactly the kind of unjustified dependency `CLAUDE.md` warns against.

---

## The Viewport Debounce + Abort Pattern (actual implementation)

```typescript
// src/components/workshop-map.tsx
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const abortRef = useRef<AbortController | null>(null);

function handleBoundsChange(bounds: Bounds) {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => void load(bounds), 400);
}

async function load(bounds: Bounds) {
  abortRef.current?.abort(); // cancel a stale in-flight request
  const controller = new AbortController();
  abortRef.current = controller;

  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`/api/workshops?${params}`, { signal: controller.signal });
    // ...
    setWorkshops(json.workshops as Workshop[]);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return; // expected, not an error
    setError(/* ... */);
  } finally {
    setLoading(false);
  }
}
```

### Why both a debounce AND an abort controller

- The 400ms debounce prevents firing a request on every intermediate `moveend`/`zoomend` during a fast pan gesture.
- The `AbortController` handles the remaining case: a request that *did* fire, but the user moved again before it resolved. Without the abort, a slow first response could land after a faster second response and stomp the (correct) later result with stale data.
- Both are cleaned up on unmount (`clearTimeout` + `abortRef.current?.abort()` in the effect cleanup).

### Why 400ms specifically

This project uses 400ms, not the 300ms sometimes seen in similar map apps — if changing this value, verify against the actual constant in `workshop-map.tsx` rather than assuming a round number. Too aggressive (below ~150ms) fires mid-gesture; too slow (500ms+) feels laggy for someone trying to quickly scan an area for a workshop.

---

## `useMemo` for the Markers Array

```typescript
const markers = useMemo(
  () =>
    workshops.map((w) => (
      <Marker key={w.id} position={[w.latitude, w.longitude]} icon={pinIcon(w.is_24h)}>
        <Popup>{/* ... */}</Popup>
      </Marker>
    )),
  [workshops],
);
```

This is genuinely useful here: `pinIcon()` constructs a new `L.DivIcon` per call, and building ~300 `<Marker>` React elements on every parent re-render (e.g. from `loading`/`error` state changes that don't touch `workshops`) would be wasted work. Memoizing on `[workshops]` means the marker list only rebuilds when the actual data changes, not when the loading badge toggles.

### NOT needed (premature optimization)

- `React.memo` on `site-header.tsx`/`site-footer.tsx` — rendered once at the root layout.
- `useMemo`/`useCallback` in `admin-dashboard.tsx` for its tab list or submission cards — at most 200 rows, re-rendered only on tab switch or a review action, not on every keystroke or animation frame.
- `useMemo` for simple string formatting (`formatHours`, `formatCoords`, `formatDate` in `src/lib/format.ts`) — these are cheap pure functions called a handful of times per render, not the bottleneck.

---

## Server-Side Row Limiting (already implemented)

```typescript
// src/lib/geo.ts
export const VIEWPORT_LIMIT = 300;

export async function getWorkshopsInBounds(bounds: Bounds, limit = VIEWPORT_LIMIT): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select(WORKSHOP_COLUMNS) // explicit column list, not select("*")
    .gte("latitude", bounds.south)
    .lte("latitude", bounds.north)
    .gte("longitude", bounds.west)
    .lte("longitude", bounds.east)
    .order("rating_count", { ascending: false })
    .limit(limit);
  // ...
}
```

The client never receives more than 300 rows per viewport query. If a future PR proposes raising this limit substantially, weigh it against actual rendering cost on a mid-range Android phone (the primary device for the emergency-use case downstream in the Android app) before approving.

---

## No Photo Lazy-Loading Concerns (No Photos Exist)

This project has no photo upload feature (`SPEC.md` §10 — explicitly out of scope for v1). There's no `<img>`-heavy list to worry about lazy-loading. Don't add `IntersectionObserver`/lazy-load infrastructure speculatively for a feature that doesn't exist yet.

---

## Anti-Patterns to Reject

### 1. Memoizing everything
```typescript
// BAD — SiteHeader never re-renders in practice, memo is dead code
const MemoizedSiteHeader = React.memo(SiteHeader);
```

### 2. Adding marker clustering pre-emptively
```typescript
// BAD — no clustering dependency exists, and the 300-row viewport cap
// already keeps rendered marker count sane
import MarkerClusterGroup from "react-leaflet-cluster";
```
If this genuinely becomes necessary later, that's a deliberate `roadmap-planner`-level decision with evidence behind it, not a defensive addition during an unrelated PR.

### 3. Over-engineering state management
```typescript
// BAD — Zustand/Redux for a workshops array and a couple of form states
import { create } from "zustand";
// This app has one meaningful piece of shared client state per page
// (workshops array in WorkshopMap, form fields in SubmitForm). useState is enough.
```

### 4. Premature code splitting
```typescript
// BAD — splitting a 20-line presentational component into its own chunk
const StatusBadge = dynamic(() => import("./status-badge"));
// Only WorkshopMap/LocationPicker (because of react-leaflet) actually
// benefit from dynamic import in this app.
```

### 5. Fetching inside `useEffect` when a server component would do
```typescript
// BAD — in admin/page.tsx if it were client-only
"use client";
useEffect(() => { fetch("/api/admin/submissions?status=pending").then(...) }, []);
```
`src/app/admin/page.tsx` is a server shell rendering the client `<AdminDashboard />`; `AdminDashboard` itself legitimately needs client-side fetching because it's interactive (tab switching, approve/reject). Don't push that fetch logic into a server component just for the sake of it — but also don't add `useEffect` fetching to something that could be a plain `await` in a server component (e.g. don't turn `site-header.tsx` into a client fetcher for no reason).

---

## How to Measure Performance

### React DevTools Profiler
1. Open Profiler, pan/zoom the map.
2. `WorkshopMap` should re-render on `moveend`/`zoomend` — expected.
3. `SiteHeader`/`SiteFooter` should NOT re-render during map interaction. If they do, state is lifted too high.
4. Check render time for the `markers` list — if consistently >16ms with a nearly-empty viewport, something else is wrong (not the marker count itself).

### Chrome Performance tab
1. Record a 5-second pan/zoom session.
2. Look for long tasks (>50ms).
3. Common culprits at this project's scale: not marker count, but unnecessary re-renders from state not being scoped correctly, or from JSON parsing of larger-than-expected responses (check that `WORKSHOP_COLUMNS` stays a lean explicit list, not `select("*")`).

### Lighthouse
See `lighthouse-review` for full detail. Quick performance-specific check: CLS from the map container (`h-[calc(100vh-4rem)]`, resolved before JS runs) and TBT from the Leaflet + react-leaflet bundle (no clustering library adds to this, unlike some sibling projects).

---

## Exit Criteria

A performance task is complete when:
1. `WorkshopMap` renders at most `VIEWPORT_LIMIT` (300) markers at any zoom level.
2. Viewport changes are debounced (400ms) and stale in-flight requests are aborted.
3. No `React.memo`, `useMemo`, or `useCallback` exists on components that don't need it.
4. `SiteHeader`/`SiteFooter` do not re-render during map interaction.
5. No marker-clustering library was added without a concrete, evidenced need.
6. No virtualization library was added for lists under 200 items (`admin-dashboard.tsx`'s cap).
7. No speculative photo lazy-loading infrastructure was added for a feature that doesn't exist.
