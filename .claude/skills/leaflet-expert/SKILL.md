---
name: leaflet-expert
description: Deep react-leaflet knowledge for TambalBan Web — SSR fix via dynamic import, declarative Marker/Popup patterns, viewport events, map component internals.
---

# leaflet-expert

Deep Leaflet knowledge for TambalBan Web — a Next.js App Router + **react-leaflet** + OpenStreetMap project mapping tire-repair shops (tambal ban) across Indonesia.

## When to Use

Activate this skill when working on any map code in this project: `src/components/workshop-map.tsx` (public map), `src/components/location-picker.tsx` (draggable pin in the submit form), `src/components/map-panel.tsx` (the dynamic-import wrapper), map events, SSR errors, or map performance.

**Important: this project uses `react-leaflet`, the React wrapper, not raw imperative Leaflet DOM calls.** Components are `<MapContainer>`, `<TileLayer>`, `<Marker>`, `<Popup>`, and hooks (`useMap`, `useMapEvents`) — not `L.map(...)`, `marker.addTo(map)`, or `map.on(...)`. If you see raw imperative Leaflet API calls being proposed for this project's map components, reconsider — the existing codebase is fully declarative.

## Core Problems and Solutions

### 1. The SSR Problem

Leaflet accesses `window` and `document` at import time. Next.js renders server-side first, where these don't exist. Every component that imports `react-leaflet` or `leaflet` must be dynamically imported with `ssr: false`.

This project's actual pattern, in `src/components/map-panel.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` at import time, so it must never be prerendered. */
const WorkshopMap = dynamic(
  () => import("./workshop-map").then((m) => m.WorkshopMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#dcd6c8]">
        <span className="card-brutal px-4 py-2 text-sm font-black uppercase">
          Memuat peta…
        </span>
      </div>
    ),
  },
);

export function MapPanel() {
  return <WorkshopMap />;
}
```

`page.tsx` renders `<MapPanel />` (a plain client component wrapper) — it never imports `workshop-map.tsx` directly, and `workshop-map.tsx` never gets loaded server-side.

The submit form uses the same pattern for `location-picker.tsx`:

```tsx
const LocationPicker = dynamic(
  () => import("./location-picker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => (/* ... */) },
);
```

If you see `import { MapContainer } from "react-leaflet"` at the top of a server component, a `page.tsx`, or `layout.tsx`, that is a bug.

### 2. Leaflet CSS

This project imports `leaflet/dist/leaflet.css` directly inside each client-only Leaflet component (`workshop-map.tsx` and `location-picker.tsx`), not in `app/layout.tsx`. That's fine here specifically because those components are only ever mounted behind a `dynamic(..., { ssr: false })` boundary — the CSS never needs to exist before the client bundle runs, and each is a distinct route (`/` vs `/submit`), so there's no real duplication cost. Do not "fix" this by moving the import into `layout.tsx` — that would force Leaflet's CSS into the initial server-rendered payload for every page, including ones with no map.

Custom Leaflet visual overrides (popup borders, zoom control styling to match the neo-brutalist theme) live in `src/app/globals.css`:

```css
.leaflet-container { background: #dcd6c8; font-family: var(--font-geist-sans), sans-serif; }
.leaflet-control-zoom a { border: 2px solid var(--color-ink) !important; font-weight: 900 !important; }
.leaflet-popup-content-wrapper, .leaflet-popup-tip { border: 3px solid var(--color-ink); border-radius: 0; box-shadow: var(--shadow-brutal-sm); }
```

### 3. Custom Marker Icons (no default Leaflet icon in use)

This project never uses Leaflet's default marker PNG icons, so the classic "broken default icon after bundling" bug doesn't apply here — every marker uses `L.divIcon` with inline-styled `<span>` elements matching the neo-brutalist "Warung" design (`--color-brand` yellow, `--color-accent` blue, `--color-danger` red, hard black border + box-shadow, no border-radius). From `workshop-map.tsx`:

```tsx
function pinIcon(is24h: boolean): L.DivIcon {
  const color = is24h ? "#00A651" : "#0057FF";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;background:${color};border:3px solid #111;box-shadow:3px 3px 0 0 #111"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}
```

And in `location-picker.tsx` for the draggable submission pin:

```tsx
const dragIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:26px;height:26px;background:#E4002B;border:3px solid #111;box-shadow:4px 4px 0 0 #111;cursor:grab"></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});
```

If a future change reintroduces `L.Marker` without an explicit `icon`, then the default-icon-path fix (`L.Icon.Default.mergeOptions({...})`) becomes relevant again — but as of this codebase, every marker is explicitly iconed.

### 4. Declarative Markers via `<Marker>` (this project's actual pattern)

Unlike a large pin-count map where hundreds of imperative `L.marker()` calls might be justified for performance, this project's viewport query is capped at `VIEWPORT_LIMIT = 300` (`src/lib/geo.ts`) and in practice a single visible viewport rarely holds anywhere near that many workshops. `react-leaflet`'s declarative `<Marker>` model is the right fit and is what's used — do not rewrite this into imperative `L.marker()`/`clusterGroup.addLayer()` calls.

The array of `<Marker>` elements is memoized so it only recomputes when `workshops` changes, not on every render:

```tsx
const markers = useMemo(
  () =>
    workshops.map((w) => (
      <Marker key={w.id} position={[w.latitude, w.longitude]} icon={pinIcon(w.is_24h)}>
        <Popup>{/* name, address, hours, rating, call button */}</Popup>
      </Marker>
    )),
  [workshops],
);
```

**No marker clustering library is used or installed** (no `leaflet.markercluster`, no `react-leaflet-cluster` in `package.json`). Don't add one speculatively — the viewport-bounded query with a 300-row cap already keeps rendered marker count sane. If workshop density in a single viewport ever becomes a real problem (dense urban area with hundreds of shops packed into one screen), that's a `roadmap-planner`-level decision, not something to silently bolt on.

### 5. Viewport Re-fetch Pattern (actual implementation)

`workshop-map.tsx` uses `useMapEvents` (the react-leaflet hook), not `map.on(...)`:

```tsx
function ViewportWatcher({ onChange }: { onChange: (bounds: Bounds) => void }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  function emit() {
    const b = map.getBounds();
    onChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  }

  useEffect(() => {
    emit(); // initial fetch on mount
  }, []);

  return null;
}
```

The parent debounces at **400ms** (not 300ms — check the actual constant if changing it) and uses `AbortController` to cancel a stale in-flight fetch when the user pans again before the previous request resolves:

```tsx
function handleBoundsChange(bounds: Bounds) {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => void load(bounds), 400);
}

async function load(bounds: Bounds) {
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;
  // ... fetch(`/api/workshops?${params}`, { signal: controller.signal })
}
```

Both the debounce timeout and the abort controller are cleaned up on unmount. Never load all workshops client-side — always viewport-bounded through `getWorkshopsInBounds` (`src/lib/geo.ts`), capped at `VIEWPORT_LIMIT`.

### 6. `location-picker.tsx`: Drag, Click-to-Move, and Programmatic Recenter

The submit flow's pin uses three react-leaflet patterns worth knowing:

```tsx
// Click anywhere on the map moves the pin (useMapEvents)
function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Recenters the map imperatively when coords change from outside the map
// (address search result, geolocation, or typing lat/lng directly)
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng]);
  return null;
}

// Dragging the marker itself
<Marker
  position={[latitude, longitude]}
  icon={dragIcon}
  draggable
  eventHandlers={{
    dragend(event) {
      const { lat, lng } = (event.target as L.Marker).getLatLng();
      onChange(lat, lng);
    },
  }}
/>
```

`useMap()` is the hook for "I need the map instance imperatively inside a component nested under `<MapContainer>`" — it's the react-leaflet-idiomatic replacement for holding a `map` ref manually.

### 7. Popup Content — Actionable, Not a Stub

Unlike a map with a separate detail page, **this project has no `/workshop/[id]` detail route.** The popup itself must carry everything an emergency user needs: name, address, hours (`formatHours()` from `src/lib/format.ts`), rating if any, and a `tel:` call button (`telHref()`). There is no "Lihat Detail" link to click through — the popup *is* the detail view. See `map-ux-reviewer` for the UX reasoning.

```tsx
<Popup>
  <div className="min-w-52 space-y-1">
    <p className="text-base font-black uppercase leading-tight">{w.name}</p>
    {w.address && <p className="text-xs">{w.address}</p>}
    <p className="text-xs font-bold">{formatHours(w)}</p>
    {w.rating_count > 0 && <p className="text-xs">★ {w.rating_avg.toFixed(1)} ({w.rating_count} ulasan)</p>}
    {w.phone && (
      <a href={telHref(w.phone)} className="mt-2 inline-block border-3 border-ink bg-brand px-2 py-1 text-xs font-black uppercase">
        Telepon
      </a>
    )}
  </div>
</Popup>
```

### 8. Coordinate Order Trap

Still applies here even without PostGIS:

| Context | Order | Example |
|---------|-------|---------|
| Leaflet JS / react-leaflet `position` prop | `[lat, lng]` | `<Marker position={[-6.2, 106.8]} />` — Jakarta |
| `Workshop` / `WorkshopSubmission` types (`src/types/index.ts`) | separate `latitude`, `longitude` fields | `{ latitude: -6.2, longitude: 106.8 }` |
| Nominatim geocode response (`/api/geocode`) | `lat`, `lon` strings | parsed as `Number(p.lat)`, `Number(p.lon)` in `route.ts` |

There is no PostGIS in this project (`CLAUDE.md` rule 9 — plain lat/lng column comparisons against `idx_workshops_location`), so the `(lng, lat)` PostGIS trap from other Leaflet projects doesn't exist here. The main real risk is swapping `latitude`/`longitude` when constructing a `position={[..., ...]}` tuple.

### 9. Indonesia Bounds — Enforced in Validation, Not on the Map Instance

`INDONESIA_BOUNDS` (`src/lib/validation.ts`) constrains what coordinates are *accepted* by `submissionSchema`, and `submit-form.tsx` re-checks it client-side with `inIndonesia()` before submitting. **The Leaflet map itself does not currently set `maxBounds`** — a user can freely pan the public map or the location picker outside Indonesia (they just won't find workshops there, and can't submit a pin there). If reviewing a change that adds `maxBounds`, note it's a UX addition, not filling a validation gap — the actual data-integrity bounds check already happens server-side in the Zod schema.

### 10. Touch/Mobile

- The location picker's draggable marker and click-to-move both need to work reliably on touch — Leaflet normalizes `click` for touch by default; no special touch config currently set (`tap`/`tapTolerance` are Leaflet defaults, unconfigured).
- Popups use `min-w-52` (Tailwind, ~13rem) — check against small viewports if popup content grows (e.g. if hours + rating + call button push width).

### 11. OSM Tiles Only

The only permitted tile layer, used in both `workshop-map.tsx` and `location-picker.tsx`:

```tsx
<TileLayer
  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  maxZoom={19}
/>
```

No Google Maps, no Mapbox, no paid tile services (`CLAUDE.md` rule 7).

## Checklist Before Committing Map Code

- [ ] Map component (`workshop-map.tsx`/`location-picker.tsx`) is only ever reached through a `dynamic(..., { ssr: false })` wrapper
- [ ] No `react-leaflet`/`leaflet` import in any server component, `page.tsx`, or `layout.tsx`
- [ ] New markers use `<Marker>`/`<Popup>` declaratively, not imperative `L.marker()`/`.addTo()`
- [ ] Coordinates passed to `position={}` are `[latitude, longitude]`, matching the `Workshop`/`WorkshopSubmission` field names
- [ ] Viewport re-fetch still debounces (currently 400ms) and aborts the previous in-flight request
- [ ] No full-dataset fetch — always through `getWorkshopsInBounds` with `VIEWPORT_LIMIT`
- [ ] Popup content is self-contained and actionable (name, hours, call button) — there is no detail page to defer to
- [ ] Only OSM tiles are used, with correct attribution
- [ ] `useMap()`/`useMapEvents()` are used instead of manually holding a Leaflet map ref

## Exit Criteria

The map task is done when:

1. The map renders correctly on first load with no SSR errors in the console.
2. Panning/zooming triggers a debounced, viewport-bounded re-fetch that updates markers.
3. Pin colors correctly distinguish 24-hour shops from limited-hours shops (`is24h` -> green vs blue, per `pinIcon()`).
4. Popup shows name, hours, and a working `tel:` call link — no dependency on a detail page that doesn't exist.
5. Mobile: pins/draggable marker are usable via touch, popup text is readable.
6. No console errors related to Leaflet, SSR, or `react-leaflet` hook misuse (e.g. `useMap`/`useMapEvents` called outside `<MapContainer>`).
