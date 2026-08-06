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
  opts: { search?: string; verified?: boolean; source?: string; limit?: number; offset?: number } = {},
): Promise<Workshop[]> {
  const params = new URLSearchParams();
  params.set("select", WORKSHOP_SELECT);
  params.set("order", "created_at.desc");
  params.set("limit", String(opts.limit ?? 100));
  if (opts.offset) params.set("offset", String(opts.offset));
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

/** Admin: bulk publish — flip verified=true for multiple IDs. */
export async function bulkPublish(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?id=in.(${ids.join(",")})`,
    {
      method: "PATCH",
      headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY),
      body: JSON.stringify({ verified: true, verified_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) throw new Error(`bulk publish failed: ${res.status} ${await res.text()}`);
}

/** Admin: bulk remove — delete multiple rows by ID. */
export async function bulkRemove(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/tambal_ban?id=in.(${ids.join(",")})`,
    { method: "DELETE", headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
  );
  if (!res.ok) throw new Error(`bulk remove failed: ${res.status} ${await res.text()}`);
}

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

/** Admin: list auth users via the Auth admin API (service role). */
export async function fetchAuthUsers(
  env: Env,
  opts: { search?: string; max?: number } = {},
): Promise<{ users: AdminUser[]; total: number }> {
  const max = opts.max ?? 200;
  const perPage = 50;
  const users: AdminUser[] = [];
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (opts.search) params.set("search", opts.search);
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?${params.toString()}`,
      { headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
    );
    if (!res.ok) throw new Error(`auth admin users failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { users: AdminUser[]; total: number };
    total = data.total ?? 0;
    users.push(...data.users);
    if (users.length >= total || users.length >= max) break;
  }
  return { users: users.slice(0, max), total };
}

export interface Review {
  id: string;
  workshop_id: string | null;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  tambal_ban: { name: string } | null;
}

/** Admin: list reviews with embedded workshop names (service role bypasses RLS). */
export async function fetchAllReviews(
  env: Env,
  opts: { rating?: number; limit?: number } = {},
): Promise<Review[]> {
  const params = new URLSearchParams();
  params.set("select", "id,workshop_id,user_id,rating,comment,created_at,tambal_ban(name)");
  params.set("order", "created_at.desc");
  params.set("limit", String(opts.limit ?? 200));
  if (opts.rating) params.set("rating", `eq.${opts.rating}`);
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reviews?${params.toString()}`,
    { headers: bearer(env.SUPABASE_SERVICE_ROLE_KEY) },
  );
  if (!res.ok) throw new Error(`reviews read failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Review[]>;
}

/** Upload an image to Supabase Storage and return the public URL. */
export async function uploadImage(
  env: Env,
  userToken: string,
  file: ArrayBuffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const path = `${id}.${ext}`;
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/workshops/${path}`, {
    method: "POST",
    headers: {
      ...userHeaders(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, userToken),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: file,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/workshops/${path}`;
}
