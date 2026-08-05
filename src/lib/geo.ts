import { supabase } from "@/lib/supabase/client";
import type { Bounds, Workshop } from "@/types";

/** Hard cap so a zoomed-out viewport can never pull the whole table. */
export const VIEWPORT_LIMIT = 300;

const WORKSHOP_COLUMNS =
  "id,name,latitude,longitude,phone,address,open_time,close_time,is_24h,rating_avg,rating_count,source,created_at";

/**
 * Workshops inside a map viewport.
 *
 * Uses lat/lng column comparisons against `idx_workshops_location`. Migrate to
 * PostGIS `ST_Within` once the table grows past ~50k rows.
 */
export async function getWorkshopsInBounds(
  bounds: Bounds,
  limit = VIEWPORT_LIMIT,
): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select(WORKSHOP_COLUMNS)
    .gte("latitude", bounds.south)
    .lte("latitude", bounds.north)
    .gte("longitude", bounds.west)
    .lte("longitude", bounds.east)
    .order("rating_count", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Gagal ambil workshop: ${error.message}`);
  return (data ?? []) as Workshop[];
}

export async function searchWorkshopsByName(
  query: string,
  limit = 20,
): Promise<Workshop[]> {
  const { data, error } = await supabase
    .from("workshops")
    .select(WORKSHOP_COLUMNS)
    .ilike("name", `%${query}%`)
    .limit(limit);

  if (error) throw new Error(`Gagal cari workshop: ${error.message}`);
  return (data ?? []) as Workshop[];
}

export async function getWorkshopCount(): Promise<number> {
  const { count, error } = await supabase
    .from("workshops")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(`Gagal hitung workshop: ${error.message}`);
  return count ?? 0;
}

/** Rough km distance between two points — good enough for "nearest" sorting. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
