---
name: openstreetmap-best-practices
description: Review OSM tile usage, attribution, and Nominatim geocoding compliance in TambalBan Web — tile policy, rate limits, custom User-Agent, tile provider alternatives.
---

# openstreetmap-best-practices

Review OpenStreetMap usage in TambalBan Web for compliance, best practices, and future readiness.

Trigger: when reviewing map configuration (`workshop-map.tsx`, `location-picker.tsx`), tile usage, attribution, geocoding (`/api/geocode`), or any OSM-related code or discussion.

## Context

This project uses `react-leaflet` with OpenStreetMap tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) to display a crowdsourced map of Indonesian tire-repair shops (tambal ban). The workshop location data (`workshops`, `workshop_submissions` in Supabase, shared with the sibling `../tambalban` Android app) is separate from OSM data but could eventually be contributed back to OSM as POIs.

---

## 1. Tile Usage Policy Compliance

OSM's tile usage policy (https://operations.osmfoundation.org/policies/tiles/) has hard requirements:

- **Attribution**: the map MUST display "© OpenStreetMap" (or "contributors") with a link to https://www.openstreetmap.org/copyright. `TileLayer`'s `attribution` prop handles this. Verify Leaflet's default attribution control isn't disabled.
- **User-Agent**: HTTP requests to `tile.openstreetmap.org` MUST include a valid User-Agent or Referer header. Browsers send Referer automatically for tile requests, so normal map usage is compliant. Any server-side tile fetching would need a custom User-Agent — this project does none.
- **No heavy automated use**: no pre-fetching, bulk-downloading, or server-side caching of tiles beyond normal browser caching.
- **Rate limiting**: `tile.openstreetmap.org` is a shared community resource — see §5.

### Review actions

- [ ] Read `workshop-map.tsx` and `location-picker.tsx`'s `<TileLayer>` configuration. Confirm `attribution` includes an OpenStreetMap credit with the copyright link. Current value: `'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'`.
- [ ] Confirm Leaflet's `attributionControl` is not disabled anywhere (`<MapContainer>` doesn't set `attributionControl={false}`).
- [ ] Search the codebase for any server-side tile fetching, caching scripts, or static map image generation. None should exist.
- [ ] Search `src/app/globals.css` for any rule hiding `.leaflet-control-attribution` (`display: none`, `visibility: hidden`, `opacity: 0`). The project's brutalist theme restyles `.leaflet-control-zoom` and popups — verify none of that styling accidentally targets/hides the attribution control.

---

## 2. Attribution Verification

Expected attribution text, as currently used in both `workshop-map.tsx` and `location-picker.tsx`:

```
&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
```

### Review actions

- [ ] Confirm both map components (public map and the submit-form location picker) carry this attribution — they're two separate `<TileLayer>` instances, so a fix in one doesn't automatically fix the other.
- [ ] Load the map in a browser (or review a screenshot) — attribution must be visible in the bottom-right corner and not obscured by the neo-brutalist UI chrome (loading badges, count badges positioned `absolute left-3 top-3` in `workshop-map.tsx` — these are top-left, so they shouldn't collide with Leaflet's default bottom-right attribution, but verify on small screens).

---

## 3. Alternative Tile Providers

The default OSM tiles are functional and match the project's stark, high-contrast visual style reasonably well already. Free alternatives that also use OSM data:

| Provider | URL pattern | Notes |
|---|---|---|
| **Carto Light** | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | Clean, muted — would need extra CSS work to still read well against the brutalist yellow/black theme |
| **Carto Voyager** | `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png` | Same terms as Carto Light; requires `© CARTO` attribution in addition to OSM |

### When to consider switching

- Traffic approaches the thresholds in §5.
- The default tiles visually clash badly with the neo-brutalist theme (subjective call — current `.leaflet-container` background override to `#dcd6c8` already softens this).

### When NOT to switch

- Traffic is low and default OSM tiles work fine — true for this project at its current stage. Don't switch pre-emptively.

---

## 4. The Relationship to OpenStreetMap Data

Workshop location data is separate from OSM, but high-quality entries could eventually be contributed back as POIs. This is a future consideration, not a v1 concern.

### Prerequisites if this is ever proposed

- **Data quality threshold**: only admin-approved `workshops` rows (never `workshop_submissions` still `pending`) should be candidates — unverified data should never reach OSM.
- **OSM tagging**: tire repair shops map to `shop=tyres` or a similar existing OSM tag (check current conventions at contribution time).
- **License compatibility**: MIT-licensed project data can be dual-licensed/contributed under ODbL at upload time — this is standard practice, not a blocker.
- **Bulk imports**: any batch upload must follow OSM's Import Guidelines (https://wiki.openstreetmap.org/wiki/Import/Guidelines), including community discussion on the imports mailing list.
- **Do not auto-sync**: never build an automated pipeline pushing `workshops` rows to OSM without human review. Note also that `workshops` is shared with the Android app — any OSM-contribution proposal needs to account for data written by both apps, not just this site's submissions.

### Review actions

- [ ] If an OSM contribution proposal appears, verify it only considers `status`-approved, human-reviewed data.
- [ ] Flag any code that automatically writes to OSM APIs.

---

## 5. Tile Server Etiquette and Scaling

| Monthly tile requests | Action needed |
|---|---|
| < 50,000 | OSM default tiles are fine |
| 50,000 - 250,000 | Monitor usage; consider Carto or another provider with higher limits |
| 250,000+ | Self-host tiles or use a CDN/proxy (e.g. `tile.openstreetmap.fr`, or a Cloudflare caching proxy) |

### Review actions

- [ ] Check if the project has any traffic/analytics signal to estimate tile request volume (currently none — no analytics scripts exist per `CLAUDE.md`/`lighthouse-review`). If volume is unknown and the project is scaling, recommend at minimum coarse monitoring (e.g. Vercel's own request analytics) before assuming default tiles will keep working.
- [ ] If volume ever exceeds 50,000/month, recommend a scaling plan per the table above.

---

## 6. Geocoding — Already Implemented via Nominatim (Not a Future Concern Here)

Unlike some projects where geocoding is a v2+ feature, **TambalBan Web already uses Nominatim in v1**, proxied through `src/app/api/geocode/route.ts`. This section reviews the actual implementation, not a hypothetical future one.

**Nominatim usage policy compliance (https://operations.osmfoundation.org/policies/nominatim/):**

- **Custom User-Agent**: set via `NOMINATIM_USER_AGENT` env var, defaulting to `"TambalBanWeb/1.0 (data collection)"` — required because a browser cannot set a custom User-Agent, which is exactly why this proxy exists instead of calling Nominatim directly from the client.
- **Rate limiting**: `/api/geocode` applies its own limiter (`rateLimit(`geocode:${clientIp}`, 30, 60_000)` — 30 requests/minute/IP) via `src/lib/rate-limit.ts`. This is stricter than Nominatim's own ~1 req/sec ceiling would require in aggregate, but protects against a single abusive client.
- **Caching**: the proxy's `fetch()` call to Nominatim sets `next: { revalidate: 86400 }` (24h) — repeated identical lookups (same lat/lng or same query string) are served from Next.js's fetch cache rather than re-hitting Nominatim.
- **No client-side direct calls**: `submit-form.tsx` always calls `/api/geocode`, never `nominatim.openstreetmap.org` directly. This must never change — see `nextjs-expert` and `security-review` for why this proxy exists.
- **Debounced autocomplete-adjacent usage**: reverse geocoding on pin move is debounced 700ms (`submit-form.tsx`) — not fired on every drag frame. Forward geocode search only fires on button click / Enter key, not on every keystroke, which is even more conservative than a debounced-keystroke approach.
- **Indonesia-scoped forward search**: `/api/geocode?q=` calls Nominatim with `countrycodes=id`, matching the project's Indonesia-only scope, and caps results at 5.

### Review actions

- [ ] Confirm no code path calls Nominatim directly from a client component — search for `nominatim.openstreetmap.org` outside `src/app/api/geocode/route.ts`.
- [ ] Confirm `NOMINATIM_USER_AGENT` is documented in `.env.local.example`/`SPEC.md` §8 (it's optional with a sane default, but should still be visible).
- [ ] Confirm the rate limit and cache settings haven't regressed if `route.ts` is modified.
- [ ] If autocomplete-as-you-type is ever proposed for the place search box, flag it — the current click/Enter-triggered search is intentionally conservative against Nominatim's policy; per-keystroke search would need its own debounce (>=300ms) and probably a lower per-IP rate limit ceiling reconsidered.

---

## 7. Indonesia-Specific OSM Quality

OSM coverage in Indonesia varies significantly by region (Java/Bali well-mapped; Sumatra/Kalimantan/Sulawesi moderate; Papua/Maluku/NTT limited).

### Impact on this project

- This affects the **visual background map**, not the workshop data itself. A workshop pin in a sparsely-mapped area will sit on a mostly blank basemap — expected and acceptable.
- Do NOT let poor OSM background coverage be used as a reason to deprioritize collecting workshop data in those areas — if anything, sparser regions are exactly where a driver with a flat tire has fewer alternatives and this data matters more (see `soul.md`).

### Review actions

- [ ] If UI copy is added anywhere implying "no map detail = no workshops here," correct it — background tile sparsity is unrelated to workshop data availability.

---

## Checklist: OSM Tile & Geocoding Compliance

- [ ] Both `<TileLayer>` instances (`workshop-map.tsx`, `location-picker.tsx`) include correct OSM attribution
- [ ] Attribution control is visible, not hidden by CSS
- [ ] No server-side tile fetching or bulk downloading
- [ ] All geocoding goes through Nominatim via `/api/geocode`, never called directly from the browser, never a proprietary geocoder (Google/Mapbox)
- [ ] `/api/geocode` sets a custom User-Agent, rate-limits (30/min/IP), and caches (`revalidate: 86400`)
- [ ] Forward-geocode search stays click/Enter-triggered, not fired on every keystroke
- [ ] Tile URLs use `https://`
- [ ] No tile prefetching beyond browser defaults

---

## Exit Criteria

This skill's review is complete when:

1. Both tile layer configurations have been read and attribution verified.
2. `globals.css` has been checked for attribution-hiding rules.
3. No server-side tile fetching or bulk downloading exists.
4. The Nominatim proxy (`/api/geocode`) is confirmed compliant: custom User-Agent, rate limiting, caching, no direct client calls.
5. Any OSM data contribution proposals have been evaluated against the import guidelines and the approved-only data requirement.
6. All items in the compliance checklist above have been checked.
