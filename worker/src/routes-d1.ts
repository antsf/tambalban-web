import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./lib/env";
import * as d1 from "./lib/d1";
import { verifyAgainstSupabaseAuth } from "./lib/legacy-auth";
import { isAdmin } from "./lib/admin-auth";
import {
  loginSchema,
  bboxSchema,
  submissionSchema,
  reviewSchema,
  profileUpdateSchema,
  adminDataQuerySchema,
} from "./lib/validation";
import { rateLimit, clientIp } from "./lib/rate-limit";

/**
 * Bearer-token JSON API for the Android app — Phase 2+4a of the Supabase -> D1 migration
 * (specs/d1-migration-plan.md). Deliberately isolated from routes.ts: nothing here is wired
 * into the live cookie/HTML surface, and none of it is called by production clients yet.
 *
 * Covers: register/login/logout/profile, read+write workshops/reviews, and the admin queue —
 * mirrors routes.ts's Supabase-backed equivalents route-for-route, but returns JSON everywhere
 * (routes.ts mixes in HTML/HTMX responses for the browser; this API never does).
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

appD1.post("/api/v2/workshops", async (c) => {
  const user = await bearerUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`v2sub:${ip}`, 5)) return c.json({ error: "Terlalu banyak kiriman. Coba lagi nanti." }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Permintaan tidak valid" }, 400);
  }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, 400);

  try {
    const row = await d1.insertWorkshopD1(c.env, user.id, parsed.data);
    return c.json(row, 201);
  } catch {
    return c.json({ error: "Gagal menyimpan kiriman. Coba lagi nanti." }, 502);
  }
});

appD1.post("/api/v2/workshops/:id/reviews", async (c) => {
  const user = await bearerUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workshopId = c.req.param("id");
  if (!UUID_RE.test(workshopId)) return c.json({ error: "Invalid ID" }, 400);
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`v2rev:${ip}`, 10)) return c.json({ error: "Terlalu banyak ulasan. Coba lagi nanti." }, 429);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Permintaan tidak valid" }, 400);
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, 400);

  try {
    const row = await d1.insertReviewD1(c.env, user.id, workshopId, parsed.data.rating, parsed.data.comment);
    return c.json(row, 201);
  } catch {
    return c.json({ error: "Gagal menyimpan ulasan. Coba lagi nanti." }, 502);
  }
});

appD1.patch("/api/v2/profile", async (c) => {
  const user = await bearerUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Permintaan tidak valid" }, 400);
  }
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, 400);

  try {
    const row = await d1.updateProfileD1(c.env, user.id, parsed.data);
    return c.json(row);
  } catch {
    return c.json({ error: "Gagal memperbarui profil." }, 502);
  }
});

// ---------- admin (same isAdmin() HMAC-cookie gate as routes.ts — browser-only, not bearer) ----------

const adminGateD1 = async (c: Context<{ Bindings: Env }>): Promise<boolean> =>
  isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET);

appD1.get("/api/v2/admin/submissions", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  try {
    return c.json(await d1.fetchUnverifiedD1(c.env));
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

appD1.get("/api/v2/admin/workshops", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  const parsed = adminDataQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  try {
    const rows = await d1.fetchAllWorkshopsD1(c.env, {
      search: parsed.data.search,
      verified: parsed.data.verified === "true" ? true : parsed.data.verified === "false" ? false : undefined,
      source: parsed.data.source,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return c.json(rows);
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

/** Admin-only, one-way — no un-publish route, matching routes.ts's contract exactly. */
appD1.post("/api/v2/admin/submissions/:id/publish", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    await d1.publishWorkshopD1(c.env, id);
    return c.body(null, 200);
  } catch {
    return c.json({ error: "Gagal menerbitkan." }, 502);
  }
});

appD1.post("/api/v2/admin/submissions/:id/remove", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    await d1.removeWorkshopD1(c.env, id);
    return c.body(null, 200);
  } catch {
    return c.json({ error: "Gagal menghapus." }, 502);
  }
});

function validUuids(body: unknown): string[] {
  const ids = body && typeof body === "object" ? (body as Record<string, unknown>).ids : undefined;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
}

appD1.post("/api/v2/admin/bulk/publish", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid" }, 400);
  }
  const ids = validUuids(body);
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await d1.bulkPublishD1(c.env, ids);
    return c.json({ published: ids.length });
  } catch {
    return c.json({ error: "Gagal menerbitkan." }, 502);
  }
});

appD1.post("/api/v2/admin/bulk/remove", async (c) => {
  if (!(await adminGateD1(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid" }, 400);
  }
  const ids = validUuids(body);
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await d1.bulkRemoveD1(c.env, ids);
    return c.json({ removed: ids.length });
  } catch {
    return c.json({ error: "Gagal menghapus." }, 502);
  }
});
