import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "./lib/env";
import * as db from "./lib/supabase";
import * as d1 from "./lib/d1";
import type { Workshop } from "./lib/supabase";
import * as sauth from "./lib/supabase-auth";
import { getUserToken, userEmailFromToken, userTokenCookie, clearUserTokenCookie } from "./lib/user-auth";
import { isAdmin, setSessionCookie, clearSessionCookie, validateAdminPassword } from "./lib/admin-auth";
import { rateLimit, clientIp } from "./lib/rate-limit";
import { securityHeaders } from "./lib/security";
import {
  submissionSchema,
  loginSchema,
  geocodeSchema,
  adminLoginSchema,
  bboxSchema,
  adminDataQuerySchema,
  adminUsersQuerySchema,
  adminReviewsQuerySchema,
} from "./lib/validation";
import {
  homePage,
  workshopDetailPage,
  loginPage,
  registerPage,
  submitPage,
  adminLoginPage,
  adminQueuePage,
  adminAllDataPage,
  adminDataList,
  adminUsersPage,
  adminReviewsPage,
} from "./views/pages";
import { errorToast, successToast } from "./views/layout";
import { resizeUploadImage } from "./lib/image";
import { SITE_URL } from "./lib/site";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** D1's booleans are SQLite integers (0/1) — admin views (views/pages.ts) still type against
 * the Supabase-era `Workshop` (real booleans). Converts at this one boundary rather than
 * loosening the view types, so views/pages.ts stays untouched by the D1 cutover. */
function toWorkshop(r: d1.WorkshopRowD1): Workshop {
  return {
    ...r,
    verified: !!r.verified,
    motorcycle_tyres: !!r.motorcycle_tyres,
    car_tyres: !!r.car_tyres,
    truck_tyres: !!r.truck_tyres,
    tubeless_repair: !!r.tubeless_repair,
    vulcanizer: !!r.vulcanizer,
    balancing: !!r.balancing,
    spooring: !!r.spooring,
    roadside_service: !!r.roadside_service,
  };
}

export const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

const isSecure = (url: string): boolean => url.startsWith("https://");

// ---------- pages ----------

interface SessionState {
  email: string | null;
  admin: boolean;
}

/** Read both cookies once so every page can render a consistent header. */
async function getSession(c: Context<{ Bindings: Env }>): Promise<SessionState> {
  const cookie = c.req.header("Cookie");
  return {
    email: userEmailFromToken(getUserToken(cookie)),
    admin: await isAdmin(cookie, c.env.ADMIN_SESSION_SECRET),
  };
}

app.get("/", async (c) => {
  const s = await getSession(c);
  const flash = c.req.query("submitted") === "1" ? successToast("Kiriman diterima. Menunggu peninjauan admin.") : "";
  return c.html(homePage({ email: s.email, admin: s.admin }, flash));
});

app.get("/workshops/:id", async (c) => {
  const s = await getSession(c);
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.html(workshopDetailPage(null, s));
  try {
    const w = await d1.fetchWorkshopByIdD1(c.env, id);
    return c.html(workshopDetailPage(w ? toWorkshop(w) : null, s));
  } catch {
    return c.html(workshopDetailPage(null, s), 502);
  }
});

app.get("/login", async (c) => {
  const s = await getSession(c);
  if (s.email) return c.redirect("/submit");
  const flash = c.req.query("registered") === "1" ? successToast("Akun dibuat. Cek email untuk konfirmasi, lalu masuk.") : "";
  return c.html(loginPage(flash, { email: null, admin: s.admin }));
});

app.get("/register", async (c) => {
  const s = await getSession(c);
  if (s.email) return c.redirect("/submit");
  return c.html(registerPage(undefined, { email: null, admin: s.admin }));
});

app.get("/submit", async (c) => {
  const s = await getSession(c);
  return c.html(submitPage(s.email, s.admin));
});

app.get("/admin/login", async (c) => {
  const s = await getSession(c);
  if (s.admin) return c.redirect("/admin");
  return c.html(adminLoginPage());
});

app.get("/admin", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  try {
    const rows = await d1.fetchUnverifiedD1(c.env);
    return c.html(adminQueuePage(rows));
  } catch {
    return c.html(errorToast("Gagal memuat antrian."), 500);
  }
});

app.get("/admin/data", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  const parsed = adminDataQuerySchema.safeParse(c.req.query());
  const q: z.infer<typeof adminDataQuerySchema> = parsed.success ? parsed.data : { limit: 100, offset: 0 };
  try {
    const rows = await d1.fetchAllWorkshopsD1(c.env, {
      search: q.search,
      verified: q.verified === "true" ? true : q.verified === "false" ? false : undefined,
      source: q.source,
      limit: q.limit,
      offset: q.offset,
    });
    return c.html(adminAllDataPage(rows.map(toWorkshop), q));
  } catch {
    return c.html(errorToast("Gagal memuat data."), 500);
  }
});

app.get("/admin/users", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  const parsed = adminUsersQuerySchema.safeParse(c.req.query());
  const q = parsed.success ? parsed.data : {};
  try {
    const { users, total } = await d1.fetchUsersD1(c.env, { search: q.search });
    return c.html(adminUsersPage(users, total, q));
  } catch {
    return c.html(errorToast("Gagal memuat pengguna."), 500);
  }
});

app.get("/admin/reviews", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  const parsed = adminReviewsQuerySchema.safeParse(c.req.query());
  const q = parsed.success ? parsed.data : { limit: 200 };
  try {
    const reviews = await d1.fetchAllReviewsD1(c.env, { rating: q.rating, limit: q.limit });
    const { users } = await d1.fetchUsersD1(c.env);
    const emails = new Map(users.map((u) => [u.id, u.email ?? ""]));
    return c.html(adminReviewsPage(reviews, emails, q));
  } catch {
    return c.html(errorToast("Gagal memuat ulasan."), 500);
  }
});

// ---------- sitemap ----------

app.get("/sitemap.xml", async (c) => {
  const urls = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/submit", priority: "0.8", changefreq: "monthly" },
    { path: "/login", priority: "0.3", changefreq: "monthly" },
    { path: "/register", priority: "0.3", changefreq: "monthly" },
  ];
  try {
    const rows = await d1.fetchVerifiedWorkshopsD1(c.env, {});
    for (const w of rows) urls.push({ path: `/workshops/${w.id}`, priority: "0.6", changefreq: "weekly" });
  } catch {
    // sitemap still works with static URLs if the DB read fails
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url><loc>${SITE_URL}${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ),
    "</urlset>",
  ].join("\n");
  c.header("Cache-Control", "public, max-age=3600, s-maxage=86400");
  return c.body(xml, 200, { "Content-Type": "application/xml" });
});

// ---------- public API ----------

/**
 * GET /api/workshops
 *
 * Public. Returns verified workshops within a bbox and/or matching a name/city search.
 * Reads tambal_ban with verified=eq.true only — never unverified rows.
 *
 * @query search - Optional name/city search (ilike).
 * @query minLat,maxLat,minLng,maxLng - Optional viewport bounds; all four required together.
 * @returns 200 - Workshop[] (bare array)
 * @returns 400 - { error } - Invalid bbox params
 * @returns 502 - { error } - Supabase failure
 * @sideeffect None (read-only)
 */
app.get("/api/workshops", async (c) => {
  const parsed = bboxSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  const { search, minLat, maxLat, minLng, maxLng } = parsed.data;
  const hasBbox = [minLat, maxLat, minLng, maxLng].every((v) => v !== undefined);
  try {
    const rows = await d1.fetchVerifiedWorkshopsD1(c.env, {
      search,
      bbox: hasBbox ? { minLat: minLat!, maxLat: maxLat!, minLng: minLng!, maxLng: maxLng! } : undefined,
    });
    c.header("Cache-Control", "public, max-age=60, s-maxage=300");
    return c.json(rows.map(toWorkshop));
  } catch (e) {
    return c.json({ error: "Gagal memuat data" }, 502);
  }
});

/**
 * GET /api/geocode
 *
 * Public, rate-limited proxy to OpenStreetMap Nominatim (Indonesia-scoped, max 5 results).
 * Never call Nominatim directly from the client — this proxy sets the required User-Agent
 * and enforces the per-IP rate limit.
 *
 * @query q - Required, 3-200 chars.
 * @returns 200 - { lat, lon, display_name }[] (bare array)
 * @returns 400 - { error } - q missing/too short
 * @returns 429 - { error } - rate limit exceeded (10/60s/IP)
 * @returns 502 - { error } - Nominatim unreachable/erroring
 * @sideeffect None
 */
app.get("/api/geocode", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`geo:${ip}`, 10)) return c.json({ error: "Terlalu banyak permintaan" }, 429);
  const parsed = geocodeSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  const { q } = parsed.data;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "id");
  url.searchParams.set("limit", "5");
  url.searchParams.set("q", q);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": c.env.NOMINATIM_USER_AGENT ?? "tambalban-web/0.1",
        Accept: "application/json",
      },
    });
    if (!res.ok) return c.json({ error: "Gagal geocode" }, 502);
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    c.header("Cache-Control", "public, max-age=300, s-maxage=600");
    return c.json(data.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), display_name: r.display_name ?? null })));
  } catch {
    return c.json({ error: "Gagal geocode" }, 502);
  }
});

// ---------- user auth ----------

/**
 * POST /api/auth/register
 *
 * Public. Creates a contributor account via Supabase Auth — same user store as the
 * Android app. Returns an HTML toast fragment, not JSON.
 *
 * @body { email, password } - loginSchema
 * @returns 200 - HTML toast; sets tb_access_token cookie + HX-Redirect: /submit,
 *   or HX-Redirect: /login?registered=1 if email confirmation is required
 * @returns 400 - HTML error toast - validation failure or Supabase Auth error
 * @sideeffect Inserts a row into auth.users (shared with the Android app)
 */
app.post("/api/auth/register", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.html(errorToast("Permintaan tidak valid"), 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.html(errorToast(parsed.error.issues[0]?.message ?? "Input tidak valid"), 400);
  const result = await sauth.register(c.env, parsed.data.email, parsed.data.password);
  if (!result.ok) return c.html(errorToast(result.error ?? "Gagal mendaftar"), 400);
  if (result.accessToken) {
    c.header("Set-Cookie", userTokenCookie(result.accessToken, isSecure(c.req.url)));
    c.header("HX-Redirect", "/submit");
    return c.html(successToast("Akun dibuat. Selamat datang!"));
  }
  c.header("HX-Redirect", "/login?registered=1");
  return c.html(successToast("Akun dibuat. Cek email untuk konfirmasi, lalu masuk."));
});

/**
 * POST /api/auth/login
 *
 * Public. Logs in an existing contributor via Supabase Auth. HTML toast fragment.
 *
 * @body { email, password } - loginSchema
 * @returns 200 - HTML toast; sets tb_access_token cookie + HX-Redirect: /submit
 * @returns 400 - HTML error toast - bad credentials or validation failure
 * @sideeffect None beyond the cookie
 */
app.post("/api/auth/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.html(errorToast("Permintaan tidak valid"), 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.html(errorToast(parsed.error.issues[0]?.message ?? "Input tidak valid"), 400);
  const result = await sauth.login(c.env, parsed.data.email, parsed.data.password);
  if (!result.ok || !result.accessToken)
    return c.html(errorToast(result.error ?? "Email/password salah"), 400);
  c.header("Set-Cookie", userTokenCookie(result.accessToken, isSecure(c.req.url)));
  c.header("HX-Redirect", "/submit");
  return c.html(successToast("Masuk berhasil."));
});

/**
 * POST /api/auth/logout (and GET variant below for plain-link logout)
 *
 * Clears the contributor session. No body.
 *
 * @returns 200 - empty body, clears tb_access_token, HX-Redirect: /
 * @sideeffect None
 */
app.post("/api/auth/logout", (c) => {
  c.header("Set-Cookie", clearUserTokenCookie());
  c.header("HX-Redirect", "/");
  return c.body(null);
});

app.get("/api/auth/logout", (c) => {
  c.header("Set-Cookie", clearUserTokenCookie());
  return c.redirect("/");
});

// ---------- image upload ----------

/**
 * POST /api/upload
 *
 * Contributor-only, rate-limited. Resizes an uploaded image (longest edge <=1600px, WebP)
 * and stores it in the shared `workshops` Supabase Storage bucket. Returns the public URL
 * for the caller to attach as `image_url` on a subsequent POST /api/submissions — this
 * route does not itself associate the photo with any workshop.
 *
 * @body multipart/form-data - "file": image/jpeg|png|webp, max 5MB
 * @returns 200 - { url }
 * @returns 400 - { error } - bad content-type/format/size, or undecodable image
 * @returns 401 - { error } - no contributor session
 * @returns 429 - { error } - rate limit (10/60s/IP)
 * @returns 500 - { error } - Storage upload failed (message is opaque)
 * @sideeffect Writes a file to the `workshops` Storage bucket
 */
app.post("/api/upload", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`upl:${ip}`, 10)) return c.json({ error: "Terlalu banyak permintaan" }, 429);
  const token = getUserToken(c.req.header("Cookie"));
  if (!token) return c.json({ error: "Harus masuk" }, 401);
  const ct = c.req.header("Content-Type") ?? "";
  if (!ct.includes("multipart/form-data")) return c.json({ error: "Invalid content type" }, 400);
  const formData = await c.req.formData();
  const raw = formData.get("file");
  if (!raw || typeof raw === "string") return c.json({ error: "No file" }, 400);
  const file = raw as { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return c.json({ error: "Format tidak didukung. Gunakan JPG, PNG, atau WebP." }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: "Ukuran maksimal 5MB." }, 400);
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let resized: ArrayBuffer;
    try {
      resized = resizeUploadImage(buf);
    } catch {
      return c.json({ error: "Gambar tidak valid atau rusak. Gunakan JPG, PNG, atau WebP." }, 400);
    }
    const url = await db.uploadImage(c.env, token, resized, "image/webp", "webp");
    return c.json({ url });
  } catch {
    return c.json({ error: "Gagal mengunggah foto. Coba lagi nanti." }, 500);
  }
});

// ---------- submissions ----------

/**
 * POST /api/submissions
 *
 * Contributor-only, rate-limited. Inserts a workshop into tambal_ban with source='user',
 * verified=false — invisible to the public until an admin publishes it. `source`/`verified`
 * are always server-set; a client cannot override either. `user_id` is stamped by a DB
 * trigger from the caller's JWT, never sent by the client.
 *
 * @body submissionSchema - name, lat/lon (Indonesia bounds), optional fields, 8 service booleans
 * @returns 200 - HTML toast; HX-Redirect: /?submitted=1
 * @returns 400 - HTML error toast - malformed JSON or Zod validation failure
 * @returns 401 - HTML error toast - no contributor session
 * @returns 429 - HTML error toast - rate limit (5/60s/IP)
 * @returns 502 - HTML error toast - insert failed (message is opaque)
 * @sideeffect Inserts one row into tambal_ban
 */
app.post("/api/submissions", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`sub:${ip}`, 5)) return c.html(errorToast("Terlalu banyak kiriman. Coba lagi nanti."), 429);
  const token = getUserToken(c.req.header("Cookie"));
  const email = userEmailFromToken(token);
  if (!email || !token) return c.html(errorToast("Harus masuk dulu untuk menambah."), 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.html(errorToast("Permintaan tidak valid"), 400);
  }
  const hp = body && typeof body === "object" ? (body as Record<string, unknown>).hp_company : "";
  if (typeof hp === "string" && hp.trim().length > 0) return c.html(errorToast("Permintaan tidak valid"), 400);
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return c.html(errorToast(parsed.error.issues[0]?.message ?? "Input tidak valid"), 400);

  const d = parsed.data;
  const row: Record<string, string | number | boolean | null> = {
    name: d.name,
    lat: d.lat,
    lon: d.lon,
    source: "user",
    verified: false,
    address: d.address ?? null,
    city: d.city ?? null,
    province: d.province ?? null,
    district: d.district ?? null,
    phone: d.phone ?? null,
    whatsapp: d.whatsapp ?? null,
    opening_hours: d.opening_hours ?? null,
    image_url: d.image_url ?? null,
    motorcycle_tyres: d.motorcycle_tyres,
    car_tyres: d.car_tyres,
    truck_tyres: d.truck_tyres,
    tubeless_repair: d.tubeless_repair,
    vulcanizer: d.vulcanizer,
    balancing: d.balancing,
    spooring: d.spooring,
    roadside_service: d.roadside_service,
  };
  try {
    await db.insertSubmission(c.env, token, row);
  } catch {
    return c.html(errorToast("Gagal menyimpan kiriman. Coba lagi nanti."), 502);
  }
  c.header("HX-Redirect", "/?submitted=1");
  return c.html(successToast("Kiriman diterima. Menunggu peninjauan admin."));
});

// ---------- admin auth + queue ----------

/**
 * POST /api/admin/login
 *
 * Public, rate-limited (brute-force guard checked before the password comparison).
 * Authenticates the shared ADMIN_PASSWORD and issues a signed HMAC session cookie.
 *
 * @body { password } - adminLoginSchema
 * @returns 200 - HTML toast; sets tb_admin_session cookie + HX-Redirect: /admin
 * @returns 400 - HTML error toast - validation failure
 * @returns 401 - HTML error toast "Password salah." - wrong password
 * @returns 429 - HTML error toast - rate limit (5/60s/IP)
 * @sideeffect None beyond the cookie
 */
app.post("/api/admin/login", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!rateLimit(`adm:${ip}`, 5)) return c.html(errorToast("Terlalu banyak percobaan."), 429);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.html(errorToast("Permintaan tidak valid"), 400);
  }
  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) return c.html(errorToast("Input tidak valid"), 400);
  const ok = await validateAdminPassword(parsed.data.password, c.env.ADMIN_PASSWORD);
  if (!ok) return c.html(errorToast("Password salah."), 401);
  const cookie = await setSessionCookie(c.env.ADMIN_SESSION_SECRET, isSecure(c.req.url));
  c.header("Set-Cookie", cookie);
  c.header("HX-Redirect", "/admin");
  return c.html(successToast("Masuk sebagai admin."));
});

/**
 * GET /api/admin/logout
 *
 * Clears the admin session cookie. No active session required to call.
 *
 * @returns 302 - redirect to /admin/login
 * @sideeffect None
 */
app.get("/api/admin/logout", async (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.redirect("/admin/login");
});

const adminGate = async (c: Context<{ Bindings: Env }>): Promise<boolean> =>
  isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET);

/**
 * GET /api/admin/submissions
 *
 * Admin-only (isAdmin() is the real security boundary — the /admin page's redirect is
 * UX only). Lists unverified user submissions (source='user', verified=false) for the
 * review queue, oldest first. Uses the service-role key — the only role that can read
 * unverified rows.
 *
 * @returns 200 - UnverifiedSubmission[] (bare array)
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - { error } - Supabase read failed
 * @sideeffect None
 */
app.get("/api/admin/submissions", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  try {
    return c.json(await d1.fetchUnverifiedD1(c.env));
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

/**
 * GET /api/admin/workshops
 *
 * Admin-only. Filtered/paginated list of ALL tambal_ban rows (verified and unverified) —
 * the only route that can list unverified rows outside the queue endpoint above.
 *
 * @query search,verified,source,limit,offset - adminDataQuerySchema
 * @returns 200 - HTML list fragment (#data-list HTMX swap target), not JSON
 * @returns 400 - { error } - invalid query params
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - { error } - Supabase read failed
 * @sideeffect None
 */
app.get("/api/admin/workshops", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
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
    return c.html(adminDataList(rows.map(toWorkshop)));
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

/**
 * POST /api/admin/submissions/:id/publish
 *
 * Admin-only. The single public-visibility transition in the app: flips verified=true
 * and stamps verified_at on one row. One-way by design — there is no un-publish route;
 * reverting is a direct DB edit, not an API call. Idempotent: re-publishing an already
 * published row just re-stamps verified_at, so a double-click is harmless.
 *
 * @param id - path param, must be a UUID (rejected with 400 before any DB call otherwise)
 * @returns 200 - HTML toast (delivered out-of-band to #toast)
 * @returns 400 - { error: "Invalid ID" }
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - HTML error toast - update failed
 * @sideeffect PATCHes tambal_ban.verified=true, verified_at=now() on one row
 */
app.post("/api/admin/submissions/:id/publish", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    await d1.publishWorkshopD1(c.env, id);
    // Button uses hx-swap="none" — both the row's removal and the toast ride
    // out-of-band, so a failed request below never touches the row at all.
    return c.html(
      `<div id="wksp-${id}" hx-swap-oob="delete"></div>` +
      `<div id="toast" hx-swap-oob="innerHTML">${successToast("Diterbitkan.")}</div>`,
    );
  } catch {
    return c.html(`<div id="toast" hx-swap-oob="innerHTML">${errorToast("Gagal menerbitkan.")}</div>`, 502);
  }
});

/**
 * POST /api/admin/submissions/:id/remove
 *
 * Admin-only. Permanently deletes one tambal_ban row — destructive and irreversible
 * through the app (the admin UI confirms before calling this). Idempotent: removing an
 * already-removed row is a no-op.
 *
 * @param id - path param, must be a UUID (rejected with 400 before any DB call otherwise)
 * @returns 200 - empty body
 * @returns 400 - { error: "Invalid ID" }
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - HTML error toast - delete failed
 * @sideeffect DELETEs one row from tambal_ban
 */
app.post("/api/admin/submissions/:id/remove", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "Invalid ID" }, 400);
  try {
    await d1.removeWorkshopD1(c.env, id);
    return c.html(`<div id="wksp-${id}" hx-swap-oob="delete"></div>`);
  } catch {
    return c.html(`<div id="toast" hx-swap-oob="innerHTML">${errorToast("Gagal menghapus.")}</div>`, 502);
  }
});

// ---------- bulk admin ----------

/**
 * POST /api/admin/bulk/publish
 *
 * Admin-only. Publishes multiple rows in one call (the queue's "select all" action).
 * Non-UUID entries in `ids` are silently dropped, not rejected as a whole-request error.
 *
 * @body { ids: string[] }
 * @returns 200 - HTML toast, e.g. "3 kiriman diterbitkan."
 * @returns 400 - { error: "No IDs" } - list empty or every entry invalid
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - HTML error toast - update failed
 * @sideeffect PATCHes tambal_ban.verified=true, verified_at=now() on the given rows
 */
app.post("/api/admin/bulk/publish", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid" }, 400); }
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await d1.bulkPublishD1(c.env, ids);
    return c.html(successToast(`${ids.length} kiriman diterbitkan.`));
  } catch {
    return c.html(errorToast("Gagal menerbitkan."), 502);
  }
});

/**
 * POST /api/admin/bulk/remove
 *
 * Admin-only. Same contract as bulk publish, but deletes the given rows.
 *
 * @body { ids: string[] }
 * @returns 200 - HTML toast, e.g. "3 kiriman dihapus."
 * @returns 400 - { error: "No IDs" }
 * @returns 401 - { error: "Unauthorized" }
 * @returns 502 - HTML error toast - delete failed
 * @sideeffect DELETEs the given rows from tambal_ban
 */
app.post("/api/admin/bulk/remove", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid" }, 400); }
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await d1.bulkRemoveD1(c.env, ids);
    return c.html(successToast(`${ids.length} kiriman dihapus.`));
  } catch {
    return c.html(errorToast("Gagal menghapus."), 502);
  }
});
