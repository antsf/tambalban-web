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

const PBKDF2_ITERATIONS = 210_000;

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
  passwordHash: string,
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
): Promise<(UserRow & { password_hash: string }) | null> {
  const row = await env.DB.prepare(`SELECT ${USER_PUBLIC_SELECT}, password_hash FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow & { password_hash: string }>();
  return row ?? null;
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
