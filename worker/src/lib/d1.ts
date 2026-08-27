import type { Env } from "./env";

/**
 * D1 data-access layer — Phase 2 of the Supabase -> D1 migration (see
 * specs/d1-migration-plan.md). Mirrors what supabase.ts does for the same tables, but as
 * explicit SQL instead of PostgREST filter strings, and with RLS translated into WHERE
 * clauses / guards here instead of database policies (D1 has no RLS).
 *
 * Password hashing uses PBKDF2-SHA256 via the native Workers SubtleCrypto — not scrypt/bcrypt,
 * since neither is available without a WASM dependency and PBKDF2 at a high iteration count is
 * an accepted, dependency-free choice for this runtime.
 */

// Cloudflare Workers' SubtleCrypto caps PBKDF2 at 100,000 iterations
// (higher throws NotSupportedError) — this is the max the runtime allows, not a choice.
const PBKDF2_ITERATIONS = 100_000;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

/** Format: pbkdf2$<iterations>$<saltB64>$<hashB64> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

export interface UserRow {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Never selects password_hash — callers get this shape or nothing. */
const USER_PUBLIC_SELECT = "id, email, username, full_name, phone, avatar_url, created_at, updated_at";

export async function createUser(
  env: Env,
  email: string,
  passwordHash: string | null,
): Promise<UserRow> {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(id, email, passwordHash)
    .run();
  const row = await findUserById(env, id);
  if (!row) throw new Error("createUser: row not found immediately after insert");
  return row;
}

export async function findUserByEmail(
  env: Env,
  email: string,
): Promise<(UserRow & { password_hash: string | null }) | null> {
  const row = await env.DB.prepare(`SELECT ${USER_PUBLIC_SELECT}, password_hash FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow & { password_hash: string | null }>();
  return row ?? null;
}

/** Sets the password hash on a migrated user the first time their legacy login succeeds. */
export async function setPasswordHash(env: Env, userId: string, passwordHash: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, userId).run();
}

export async function findUserById(env: Env, id: string): Promise<UserRow | null> {
  const row = await env.DB.prepare(`SELECT ${USER_PUBLIC_SELECT} FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ?? null;
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function createSession(env: Env, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return { token, expiresAt };
}

/** Returns the session's user (never an expired one — expired rows are lazily deleted here). */
export async function getSessionUser(env: Env, token: string): Promise<UserRow | null> {
  const session = await env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .bind(token)
    .first<{ user_id: string; expires_at: string }>();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return findUserById(env, session.user_id);
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

export interface WorkshopRowD1 {
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
  verified: number;
  verified_at: string | null;
  motorcycle_tyres: number;
  car_tyres: number;
  truck_tyres: number;
  tubeless_repair: number;
  vulcanizer: number;
  balancing: number;
  spooring: number;
  roadside_service: number;
  created_at: string;
  updated_at: string;
}

const WORKSHOP_SELECT_D1 = [
  "id", "name", "lat", "lon", "address", "city", "province", "district",
  "phone", "whatsapp", "website", "instagram", "opening_hours", "image_url",
  "source", "verified", "verified_at",
  "motorcycle_tyres", "car_tyres", "truck_tyres", "tubeless_repair",
  "vulcanizer", "balancing", "spooring", "roadside_service",
  "created_at", "updated_at",
].join(", ");

const WORKSHOP_ROW_CAP = 200;

/**
 * Read-only, public. Always filters verified=1 — the D1 equivalent of the
 * public_read_verified RLS policy, enforced here since D1 has no RLS.
 */
export async function fetchVerifiedWorkshopsD1(
  env: Env,
  opts: { search?: string; bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number } } = {},
): Promise<WorkshopRowD1[]> {
  const conditions: string[] = ["verified = 1"];
  const params: unknown[] = [];

  if (opts.bbox) {
    conditions.push("lat BETWEEN ? AND ?", "lon BETWEEN ? AND ?");
    params.push(opts.bbox.minLat, opts.bbox.maxLat, opts.bbox.minLng, opts.bbox.maxLng);
  }
  if (opts.search) {
    conditions.push("(name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')");
    const escaped = `%${opts.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(escaped, escaped);
  }

  const sql = `SELECT ${WORKSHOP_SELECT_D1} FROM tambal_ban WHERE ${conditions.join(" AND ")} ORDER BY name ASC LIMIT ${WORKSHOP_ROW_CAP}`;
  const { results } = await env.DB.prepare(sql).bind(...params).all<WorkshopRowD1>();
  return results;
}

/** Read-only, public. Same verified=1 gate as fetchVerifiedWorkshopsD1. */
export async function fetchWorkshopByIdD1(env: Env, id: string): Promise<WorkshopRowD1 | null> {
  const row = await env.DB.prepare(`SELECT ${WORKSHOP_SELECT_D1} FROM tambal_ban WHERE id = ? AND verified = 1`)
    .bind(id)
    .first<WorkshopRowD1>();
  return row ?? null;
}

export interface ReviewRowD1 {
  id: string;
  workshop_id: string | null;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

/** Read-only, public — mirrors the public_read_reviews policy (no filter). */
export async function fetchReviewsD1(env: Env, workshopId: string): Promise<ReviewRowD1[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, workshop_id, user_id, rating, comment, created_at FROM reviews WHERE workshop_id = ? ORDER BY created_at DESC",
  )
    .bind(workshopId)
    .all<ReviewRowD1>();
  return results;
}

export interface WorkshopSubmissionInput {
  name: string;
  lat: number;
  lon: number;
  address?: string;
  city?: string;
  province?: string;
  district?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  instagram?: string;
  opening_hours?: string;
  image_url?: string;
  motorcycle_tyres: boolean;
  car_tyres: boolean;
  truck_tyres: boolean;
  tubeless_repair: boolean;
  vulcanizer: boolean;
  balancing: boolean;
  spooring: boolean;
  roadside_service: boolean;
}

/**
 * user_id/source/verified are set here, never accepted from the caller — mirrors the
 * user_insert RLS policy this replaces (see specs/d1-migration-plan.md's RLS table).
 */
export async function insertWorkshopD1(
  env: Env,
  userId: string,
  d: WorkshopSubmissionInput,
): Promise<WorkshopRowD1> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO tambal_ban (
      id, name, lat, lon, address, city, province, district, phone, whatsapp, website,
      instagram, opening_hours, image_url, source, verified, user_id,
      motorcycle_tyres, car_tyres, truck_tyres, tubeless_repair, vulcanizer, balancing,
      spooring, roadside_service, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, d.name, d.lat, d.lon, d.address ?? null, d.city ?? null, d.province ?? null,
      d.district ?? null, d.phone ?? null, d.whatsapp ?? null, d.website ?? null,
      d.instagram ?? null, d.opening_hours ?? null, d.image_url ?? null, userId,
      d.motorcycle_tyres ? 1 : 0, d.car_tyres ? 1 : 0, d.truck_tyres ? 1 : 0,
      d.tubeless_repair ? 1 : 0, d.vulcanizer ? 1 : 0, d.balancing ? 1 : 0,
      d.spooring ? 1 : 0, d.roadside_service ? 1 : 0, now, now,
    )
    .run();
  const row = await fetchWorkshopByIdOrOwnerD1(env, id, userId);
  if (!row) throw new Error("insertWorkshopD1: row not found immediately after insert");
  return row;
}

/** Like fetchWorkshopByIdD1, but also allows the submitter to read back their own unverified row. */
async function fetchWorkshopByIdOrOwnerD1(env: Env, id: string, userId: string): Promise<WorkshopRowD1 | null> {
  const row = await env.DB.prepare(
    `SELECT ${WORKSHOP_SELECT_D1} FROM tambal_ban WHERE id = ? AND (verified = 1 OR user_id = ?)`,
  )
    .bind(id, userId)
    .first<WorkshopRowD1>();
  return row ?? null;
}

export async function insertReviewD1(
  env: Env,
  userId: string,
  workshopId: string,
  rating: number,
  comment: string | undefined,
): Promise<ReviewRowD1> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO reviews (id, workshop_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, workshopId, userId, rating, comment ?? null, now)
    .run();
  return { id, workshop_id: workshopId, user_id: userId, rating, comment: comment ?? null, created_at: now };
}

export interface ProfileUpdateInput {
  username?: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

/** Never touches email or password_hash — those need their own re-verification flow, not this route. */
export async function updateProfileD1(env: Env, userId: string, d: ProfileUpdateInput): Promise<UserRow> {
  await env.DB.prepare(
    "UPDATE users SET username = ?, full_name = ?, phone = ?, avatar_url = ? WHERE id = ?",
  )
    .bind(d.username ?? null, d.full_name ?? null, d.phone ?? null, d.avatar_url ?? null, userId)
    .run();
  const row = await findUserById(env, userId);
  if (!row) throw new Error("updateProfileD1: user not found after update");
  return row;
}

export interface UnverifiedWorkshopD1 {
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
  opening_hours: string | null;
  user_id: string | null;
  created_at: string;
}

/** Admin queue — mirrors fetchUnverifiedSubmissions in supabase.ts (source='user' AND verified=0). */
export async function fetchUnverifiedD1(env: Env): Promise<UnverifiedWorkshopD1[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, lat, lon, address, city, province, district, phone, whatsapp,
            opening_hours, user_id, created_at
     FROM tambal_ban WHERE source = 'user' AND verified = 0 ORDER BY created_at ASC`,
  ).all<UnverifiedWorkshopD1>();
  return results;
}

/** Admin: list every row in tambal_ban, filtered/paginated — mirrors fetchAllWorkshops in supabase.ts. */
export async function fetchAllWorkshopsD1(
  env: Env,
  opts: { search?: string; verified?: boolean; source?: string; limit?: number; offset?: number } = {},
): Promise<WorkshopRowD1[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    conditions.push("(name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')");
    const escaped = `%${opts.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(escaped, escaped, escaped);
  }
  if (opts.verified !== undefined) conditions.push(`verified = ${opts.verified ? 1 : 0}`);
  if (opts.source) {
    conditions.push("source = ?");
    params.push(opts.source);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const sql = `SELECT ${WORKSHOP_SELECT_D1} FROM tambal_ban ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  const { results } = await env.DB.prepare(sql).bind(...params).all<WorkshopRowD1>();
  return results;
}

/** Admin: flip verified=1 and stamp verified_at. One-way — there is no un-publish route. */
export async function publishWorkshopD1(env: Env, id: string): Promise<void> {
  await env.DB.prepare("UPDATE tambal_ban SET verified = 1, verified_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}

/** Admin: permanently delete one row. */
export async function removeWorkshopD1(env: Env, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM tambal_ban WHERE id = ?").bind(id).run();
}

/** Admin: publish multiple rows in one call. */
export async function bulkPublishD1(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await env.DB.prepare(`UPDATE tambal_ban SET verified = 1, verified_at = ? WHERE id IN (${placeholders})`)
    .bind(new Date().toISOString(), ...ids)
    .run();
}

/** Admin: delete multiple rows in one call. */
export async function bulkRemoveD1(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(", ");
  await env.DB.prepare(`DELETE FROM tambal_ban WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();
}

export interface AdminUserD1 {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  /** D1's users table has no sign-in tracking (unlike Supabase Auth) — always null. */
  last_sign_in_at: string | null;
}

/** Admin: list users, paginated by a hard max (mirrors fetchAuthUsers's {users, total} shape). */
export async function fetchUsersD1(
  env: Env,
  opts: { search?: string; max?: number } = {},
): Promise<{ users: AdminUserD1[]; total: number }> {
  const max = opts.max ?? 200;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.search) {
    conditions.push("(email LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\')");
    const escaped = `%${opts.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    params.push(escaped, escaped, escaped);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM users ${where}`)
    .bind(...params)
    .first<{ total: number }>();
  const { results } = await env.DB.prepare(
    `SELECT id, email, phone, created_at, NULL as last_sign_in_at FROM users ${where} ORDER BY created_at DESC LIMIT ${max}`,
  )
    .bind(...params)
    .all<AdminUserD1>();
  return { users: results, total: countRow?.total ?? results.length };
}

export interface ReviewD1 {
  id: string;
  workshop_id: string | null;
  user_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  tambal_ban: { name: string } | null;
}

/** Admin: list reviews with the workshop name joined in — mirrors fetchAllReviews's embed shape. */
export async function fetchAllReviewsD1(
  env: Env,
  opts: { rating?: number; limit?: number } = {},
): Promise<ReviewD1[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.rating) {
    conditions.push("reviews.rating = ?");
    params.push(opts.rating);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 200;
  const { results } = await env.DB.prepare(
    `SELECT reviews.id, reviews.workshop_id, reviews.user_id, reviews.rating, reviews.comment,
            reviews.created_at, tambal_ban.name as workshop_name
     FROM reviews LEFT JOIN tambal_ban ON tambal_ban.id = reviews.workshop_id
     ${where} ORDER BY reviews.created_at DESC LIMIT ${limit}`,
  )
    .bind(...params)
    .all<{
      id: string; workshop_id: string | null; user_id: string | null; rating: number;
      comment: string | null; created_at: string; workshop_name: string | null;
    }>();
  return results.map(({ workshop_name, ...r }) => ({ ...r, tambal_ban: workshop_name ? { name: workshop_name } : null }));
}
