import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./lib/env";
import * as d1 from "./lib/d1";
import { verifyAgainstSupabaseAuth } from "./lib/legacy-auth";
import { loginSchema, bboxSchema } from "./lib/validation";
import { rateLimit, clientIp } from "./lib/rate-limit";

/**
 * Bearer-token JSON API for the Android app — Phase 2 of the Supabase -> D1 migration
 * (specs/d1-migration-plan.md). Deliberately isolated from routes.ts: nothing here is wired
 * into the live cookie/HTML surface, and none of it is called by production clients yet.
 *
 * Scope for this phase, per the plan: read-only against D1 for workshops/reviews, plus
 * register/login/logout (needed to exercise the session path at all). Submitting a workshop,
 * posting a review, and editing a profile are NOT implemented here yet — those are write
 * paths the plan explicitly defers until the read side is verified.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const appD1 = new Hono<{ Bindings: Env }>();

async function bearerUser(c: Context<{ Bindings: Env }>) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  return d1.getSessionUser(c.env, token);
}

appD1.post("/api/v2/auth/register", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`v2reg:${ip}`, 5)) return c.json({ error: "Terlalu banyak percobaan." }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Permintaan tidak valid" }, 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, 400);

  const existing = await d1.findUserByEmail(c.env, parsed.data.email);
  if (existing) return c.json({ error: "Email sudah terdaftar" }, 400);

  const passwordHash = await d1.hashPassword(parsed.data.password);
  const user = await d1.createUser(c.env, parsed.data.email, passwordHash);
  const session = await d1.createSession(c.env, user.id);
  return c.json({ token: session.token, expires_at: session.expiresAt, user });
});

appD1.post("/api/v2/auth/login", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`v2login:${ip}`, 5)) return c.json({ error: "Terlalu banyak percobaan." }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Permintaan tidak valid" }, 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, 400);

  const found = await d1.findUserByEmail(c.env, parsed.data.email);
  if (!found) return c.json({ error: "Email/password salah" }, 400);

  if (found.password_hash === null) {
    // Migrated user, no D1 password yet — verify against the still-live Supabase Auth,
    // and only on success adopt a fresh D1 password hash (see lib/legacy-auth.ts).
    const legacyOk = await verifyAgainstSupabaseAuth(c.env, parsed.data.email, parsed.data.password);
    if (!legacyOk) return c.json({ error: "Email/password salah" }, 400);
    const newHash = await d1.hashPassword(parsed.data.password);
    await d1.setPasswordHash(c.env, found.id, newHash);
  } else if (!(await d1.verifyPassword(parsed.data.password, found.password_hash))) {
    return c.json({ error: "Email/password salah" }, 400);
  }

  const { password_hash: _unused, ...user } = found;
  const session = await d1.createSession(c.env, user.id);
  return c.json({ token: session.token, expires_at: session.expiresAt, user });
});

appD1.post("/api/v2/auth/logout", async (c) => {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) {
    await d1.deleteSession(c.env, header.slice("Bearer ".length).trim());
  }
  return c.body(null, 204);
});

appD1.get("/api/v2/profile", async (c) => {
  const user = await bearerUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(user);
});

appD1.get("/api/v2/workshops", async (c) => {
  const parsed = bboxSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  const { search, minLat, maxLat, minLng, maxLng } = parsed.data;
  const hasBbox = [minLat, maxLat, minLng, maxLng].every((v) => v !== undefined);
  try {
    const rows = await d1.fetchVerifiedWorkshopsD1(c.env, {
      search,
      bbox: hasBbox ? { minLat: minLat!, maxLat: maxLat!, minLng: minLng!, maxLng: maxLng! } : undefined,
    });
    return c.json(rows);
  } catch {
    return c.json({ error: "Gagal memuat data" }, 502);
  }
});

appD1.get("/api/v2/workshops/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    const row = await d1.fetchWorkshopByIdD1(c.env, id);
    if (!row) return c.json({ error: "Tidak ditemukan" }, 404);
    return c.json(row);
  } catch {
    return c.json({ error: "Gagal memuat data" }, 502);
  }
});

appD1.get("/api/v2/workshops/:id/reviews", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    const rows = await d1.fetchReviewsD1(c.env, id);
    return c.json(rows);
  } catch {
    return c.json({ error: "Gagal memuat data" }, 502);
  }
});
