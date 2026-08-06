import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "./lib/env";
import * as db from "./lib/supabase";
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

export const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

const isSecure = (url: string): boolean => url.startsWith("https://");

// ---------- pages ----------

app.get("/", (c) => c.html(homePage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));

app.get("/submit", (c) => {
  const email = userEmailFromToken(getUserToken(c.req.header("Cookie")));
  return c.html(submitPage(email));
});

app.get("/admin/login", (c) => c.html(adminLoginPage()));

app.get("/admin", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  try {
    const rows = await db.fetchUnverifiedSubmissions(c.env);
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
    const rows = await db.fetchAllWorkshops(c.env, {
      search: q.search,
      verified: q.verified === "true" ? true : q.verified === "false" ? false : undefined,
      source: q.source,
      limit: q.limit,
    });
    return c.html(adminAllDataPage(rows, q));
  } catch {
    return c.html(errorToast("Gagal memuat data."), 500);
  }
});

app.get("/admin/users", async (c) => {
  if (!(await isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET))) return c.redirect("/admin/login");
  const parsed = adminUsersQuerySchema.safeParse(c.req.query());
  const q = parsed.success ? parsed.data : {};
  try {
    const { users, total } = await db.fetchAuthUsers(c.env, { search: q.search });
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
    const reviews = await db.fetchAllReviews(c.env, { rating: q.rating, limit: q.limit });
    const { users } = await db.fetchAuthUsers(c.env);
    const emails = new Map(users.map((u) => [u.id, u.email ?? ""]));
    return c.html(adminReviewsPage(reviews, emails, q));
  } catch {
    return c.html(errorToast("Gagal memuat ulasan."), 500);
  }
});

// ---------- sitemap ----------

app.get("/sitemap.xml", (c) => {
  const urls = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/submit", priority: "0.8", changefreq: "monthly" },
    { path: "/login", priority: "0.3", changefreq: "monthly" },
    { path: "/register", priority: "0.3", changefreq: "monthly" },
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url><loc>https://tambalban.org${u.path}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ),
    "</urlset>",
  ].join("\n");
  return c.body(xml, 200, { "Content-Type": "application/xml" });
});

// ---------- public API ----------

app.get("/api/workshops", async (c) => {
  const parsed = bboxSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  const { search, minLat, maxLat, minLng, maxLng } = parsed.data;
  const hasBbox = [minLat, maxLat, minLng, maxLng].every((v) => v !== undefined);
  try {
    const rows = await db.fetchVerifiedWorkshops(c.env, {
      search,
      bbox: hasBbox ? { minLat: minLat!, maxLat: maxLat!, minLng: minLng!, maxLng: maxLng! } : undefined,
    });
    return c.json(rows);
  } catch (e) {
    return c.json({ error: "Gagal memuat data" }, 502);
  }
});

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
    return c.json(data.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), display_name: r.display_name ?? null })));
  } catch {
    return c.json({ error: "Gagal geocode" }, 502);
  }
});

// ---------- user auth ----------

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
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  try {
    const buf = await file.arrayBuffer();
    const url = await db.uploadImage(c.env, token, buf, file.type, ext);
    return c.json({ url });
  } catch (e) {
    return c.json({ error: `Gagal upload: ${e instanceof Error ? e.message : ""}` }, 500);
  }
});

// ---------- submissions ----------

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
  } catch (e) {
    return c.html(errorToast(`Gagal menyimpan kiriman. ${e instanceof Error ? e.message : ""}`), 502);
  }
  c.header("HX-Redirect", "/?submitted=1");
  return c.html(successToast("Kiriman diterima. Menunggu peninjauan admin."));
});

// ---------- admin auth + queue ----------

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

app.get("/api/admin/logout", async (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.redirect("/admin/login");
});

const adminGate = async (c: Context<{ Bindings: Env }>): Promise<boolean> =>
  isAdmin(c.req.header("Cookie"), c.env.ADMIN_SESSION_SECRET);

app.get("/api/admin/submissions", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  try {
    return c.json(await db.fetchUnverifiedSubmissions(c.env));
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

app.get("/api/admin/workshops", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  const parsed = adminDataQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "Parameter tidak valid" }, 400);
  try {
    const rows = await db.fetchAllWorkshops(c.env, {
      search: parsed.data.search,
      verified: parsed.data.verified === "true" ? true : parsed.data.verified === "false" ? false : undefined,
      source: parsed.data.source,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return c.html(adminDataList(rows));
  } catch {
    return c.json({ error: "Gagal memuat" }, 502);
  }
});

app.post("/api/admin/submissions/:id/publish", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  try {
    await db.publishSubmission(c.env, id);
    return c.html(successToast("Diterbitkan."));
  } catch {
    return c.html(errorToast("Gagal menerbitkan."), 502);
  }
});

app.post("/api/admin/submissions/:id/remove", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  try {
    await db.removeSubmission(c.env, id);
    return c.html("");
  } catch {
    return c.html(errorToast("Gagal menghapus."), 502);
  }
});

// ---------- bulk admin ----------

app.post("/api/admin/bulk/publish", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid" }, 400); }
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await db.bulkPublish(c.env, ids);
    return c.html(successToast(`${ids.length} kiriman diterbitkan.`));
  } catch {
    return c.html(errorToast("Gagal menerbitkan."), 502);
  }
});

app.post("/api/admin/bulk/remove", async (c) => {
  if (!(await adminGate(c))) return c.json({ error: "Unauthorized" }, 401);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid" }, 400); }
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (!ids.length) return c.json({ error: "No IDs" }, 400);
  try {
    await db.bulkRemove(c.env, ids);
    return c.html(successToast(`${ids.length} kiriman dihapus.`));
  } catch {
    return c.html(errorToast("Gagal menghapus."), 502);
  }
});
