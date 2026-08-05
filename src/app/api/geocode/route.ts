import { clientIp, rateLimit } from "@/lib/rate-limit";

const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Nominatim requires an identifying User-Agent, which a browser cannot set. */
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ?? "TambalBanWeb/1.0 (data collection)";

type NominatimPlace = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
};

async function callNominatim(path: string): Promise<unknown> {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "id" },
    // Nominatim asks for max 1 req/sec; caching repeated lookups keeps us polite.
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

export async function GET(request: Request) {
  const limit = rateLimit(`geocode:${clientIp(request)}`, 30, 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Terlalu banyak permintaan geocoding" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const params = new URL(request.url).searchParams;
  const lat = params.get("lat");
  const lng = params.get("lng");
  const query = params.get("q")?.trim();

  try {
    // Reverse: coordinates -> address
    if (lat && lng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        return Response.json({ error: "lat/lng tidak valid" }, { status: 400 });
      }

      const place = (await callNominatim(
        `/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&zoom=18&addressdetails=1`,
      )) as NominatimPlace;

      return Response.json({
        address: place.display_name ?? null,
        detail: place.address ?? null,
      });
    }

    // Forward: place name -> coordinates (Indonesia only)
    if (query) {
      if (query.length < 3) {
        return Response.json(
          { error: "Kata kunci minimal 3 karakter" },
          { status: 400 },
        );
      }

      const places = (await callNominatim(
        `/search?format=jsonv2&countrycodes=id&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`,
      )) as NominatimPlace[];

      return Response.json({
        results: places.map((p) => ({
          label: p.display_name ?? "",
          latitude: Number(p.lat),
          longitude: Number(p.lon),
        })),
      });
    }

    return Response.json(
      { error: "Butuh parameter ?lat=&lng= atau ?q=" },
      { status: 400 },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Geocoding gagal" },
      { status: 502 },
    );
  }
}
