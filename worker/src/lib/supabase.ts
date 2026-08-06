import type { Env } from "./env";

const JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

function bearer(token: string): Record<string, string> {
  return {
    apikey: token,
    Authorization: `Bearer ${token}`,
    ...JSON_HEADERS,
  };
}

/** Headers for a request acting as a logged-in user: anon apikey + user JWT for RLS. */
function userHeaders(anonKey: string, userToken: string): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${userToken}`,
    ...JSON_HEADERS,
  };
}

export interface Workshop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  province: string | null;
  district: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  image_url: string | null;
  source: string;
  verified: boolean;
  verified_at: string | null;
  motorcycle_tyres: boolean;
  car_tyres: boolean;
  truck_tyres: boolean;
  tubeless_repair: boolean;
  vulcanizer: boolean;
  balancing: boolean;
  spooring: boolean;
  roadside_service: boolean;
  created_at: string;
  updated_at: string;
}

export type UnverifiedSubmission = Pick<
  Workshop,
  "id" | "name" | "lat" | "lon" | "address" | "city" | "province" | "district" | "phone" | "whatsapp" | "opening_hours" | "created_at"
> & { user_id: string | null };

export const WORKSHOP_SELECT = [
  "id", "name", "lat", "lon", "address", "city", "province", "district",
  "phone", "whatsapp", "website", "instagram", "opening_hours", "image_url",
  "source", "verified", "verified_at",
  "motorcycle_tyres", "car_tyres", "truck_tyres", "tubeless_repair",
  "vulcanizer", "balancing", "spooring", "roadside_service",
  "created_at", "updated_at",
].join(",");

/**
 * Read verified workshops from the shared table using the anon key.
 * The map/search route must never read unverified rows.
 */
export async function fetchVerifiedWorkshops(
  env: Env,
  opts: { search?: string; bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number } } = {},
): Promise<Workshop[]> {
  const params = new URLSearchParams();
  params.set("select", WORKSHOP_SELECT);
  params.set("verified", "eq.true");
  params.set("order", "name.asc");

  if (opts.search) {
    params.set(
      "or",
      `(name.ilike.*${opts.search}*,city.ilike.*${opts.search}*)`,
    );
  }
  if (opts.bbox) {
    const { minLat, maxLat, minLng, maxLng } = opts.bbox;
    params.set("lat", `gte.${minLat}`);
    params.append("lat", `lte.${maxLat}`);
    params.set("lon", `gte.${minLng}`);
    params.append("lon", `lte.${maxLng}`);
  }

  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?${params.toString()}`,
    { headers: bearer(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
  );
  if (!res.ok) throw new Error(`tambal_ban read failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Workshop[]>;
}

/** Insert a user submission. The RLS user_insert policy + BEFORE INSERT trigger stamp user_id. */
export async function insertSubmission(
  env: Env,
  userToken: string,
  row: Record<string, string | number | boolean | null>,
): Promise<Workshop> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban`, {
    method: "POST",
    headers: { ...userHeaders(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, userToken), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
  const [created] = (await res.json()) as Workshop[];
  return created;
}

/** Admin: list unverified user submissions (service role bypasses RLS). */
export async function fetchUnverifiedSubmissions(env: Env): Promise<UnverifiedSubmission[]> {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,name,lat,lon,address,city,province,district,phone,whatsapp,opening_hours,user_id,created_at",
  );
  params.set("source", "eq.user");
  params.set("verified", "eq.false");
  params.set("order", "created_at.asc");
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?${params.toString()}`,
    { headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
  );
  if (!res.ok) throw new Error(`admin queue read failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<UnverifiedSubmission[]>;
}

/** Admin: list every row in tambal_ban (service role bypasses RLS). */
export async function fetchAllWorkshops(
  env: Env,
  opts: { search?: string; verified?: boolean; source?: string; limit?: number } = {},
): Promise<Workshop[]> {
  const params = new URLSearchParams();
  params.set("select", WORKSHOP_SELECT);
  params.set("order", "created_at.desc");
  params.set("limit", String(opts.limit ?? 100));
  if (opts.search) {
    params.set("or", `(name.ilike.*${opts.search}*,address.ilike.*${opts.search}*,city.ilike.*${opts.search}*)`);
  }
  if (opts.verified !== undefined) params.set("verified", opts.verified ? "eq.true" : "eq.false");
  if (opts.source) params.set("source", `eq.${opts.source}`);
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?${params.toString()}`,
    { headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
  );
  if (!res.ok) throw new Error(`admin all-data read failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Workshop[]>;
}

/** Admin: flip verified=true and stamp verified_at. */
export async function publishSubmission(env: Env, id: string): Promise<void> {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?id=eq.${id}`,
    {
      method: "PATCH",
      headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY),
      body: JSON.stringify({ verified: true, verified_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) throw new Error(`publish failed: ${res.status} ${await res.text()}`);
}

/** Admin: remove a submission entirely. */
export async function removeSubmission(env: Env, id: string): Promise<void> {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?id=eq.${id}`,
    { method: "DELETE", headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
  );
  if (!res.ok) throw new Error(`remove failed: ${res.status} ${await res.text()}`);
}
