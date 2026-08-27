import { describe, expect, it, vi, beforeEach } from "vitest";
import { app } from "./routes";
import * as d1 from "./lib/d1";
import * as r2 from "./lib/r2";
import * as legacyAuth from "./lib/legacy-auth";
import type { Env } from "./lib/env";
import { setSessionCookie } from "./lib/admin-auth";
import { resizeUploadImage } from "./lib/image";

vi.mock("./lib/d1", () => ({
  fetchUnverifiedD1: vi.fn(),
  fetchAllWorkshopsD1: vi.fn(),
  fetchVerifiedWorkshopsD1: vi.fn(),
  fetchWorkshopByIdD1: vi.fn(),
  publishWorkshopD1: vi.fn(),
  removeWorkshopD1: vi.fn(),
  bulkPublishD1: vi.fn(),
  bulkRemoveD1: vi.fn(),
  fetchUsersD1: vi.fn(),
  fetchAllReviewsD1: vi.fn(),
  getSessionUser: vi.fn(),
  findUserByEmail: vi.fn(),
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (p: string, h: string) => h === `hashed:${p}`),
  createUser: vi.fn(),
  createSession: vi.fn(),
  setPasswordHash: vi.fn(),
  deleteSession: vi.fn(),
  insertWorkshopD1: vi.fn(),
}));

vi.mock("./lib/r2", () => ({
  uploadWorkshopImage: vi.fn(),
}));

vi.mock("./lib/legacy-auth", () => ({
  verifyAgainstSupabaseAuth: vi.fn(),
}));

vi.mock("./lib/image", () => ({
  resizeUploadImage: vi.fn(() => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer),
}));

const env: Env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  ADMIN_PASSWORD: "hunter2",
  ADMIN_SESSION_SECRET: "test-secret",
  // Not exercised by any route under test here — see routes-d1.test.ts for the D1 surface.
  DB: {} as unknown as D1Database,
  WORKSHOPS_BUCKET: { get: vi.fn(), put: vi.fn() } as unknown as R2Bucket,
  AVATARS_BUCKET: { get: vi.fn(), put: vi.fn() } as unknown as R2Bucket,
};

const UUID = "50493a0c-45be-480e-84f0-67814df98f29";
const OTHER_UUID = "50493a0c-45be-480e-84f0-67814df98f30";

/** D1 session tokens are opaque — a test "logs in" by mocking getSessionUser to resolve
 * this token to a user, then sending it as the tb_access_token cookie. */
const FAKE_SESSION_TOKEN = "fake-session-token";
const FAKE_USER: d1.UserRow = {
  id: UUID,
  email: "user@example.com",
  username: null,
  full_name: null,
  phone: null,
  avatar_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function loggedInCookie(): string {
  vi.mocked(d1.getSessionUser).mockResolvedValue(FAKE_USER);
  return `tb_access_token=${FAKE_SESSION_TOKEN}`;
}

async function adminCookie(): Promise<string> {
  const cookie = await setSessionCookie(env.ADMIN_SESSION_SECRET, false);
  return cookie.split(";")[0];
}

function validSubmissionBody() {
  return {
    name: "Tambal Ban Jaya",
    lat: -6.2,
    lon: 106.8,
    city: "Jakarta",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin gate (publish/remove state machine)", () => {
  it("rejects publish without an admin session", async () => {
    const res = await app.request(`/api/admin/submissions/${UUID}/publish`, { method: "POST" }, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(d1.publishWorkshopD1).not.toHaveBeenCalled();
  });

  it("rejects remove without an admin session", async () => {
    const res = await app.request(`/api/admin/submissions/${UUID}/remove`, { method: "POST" }, env);
    expect(res.status).toBe(401);
    expect(d1.removeWorkshopD1).not.toHaveBeenCalled();
  });

  it("publishes a submission with a valid admin session", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      `/api/admin/submissions/${UUID}/publish`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.publishWorkshopD1).toHaveBeenCalledWith(env, UUID);
    expect((await res.text()).toLowerCase()).toContain("diterbitkan");
  });

  it("removes a submission with a valid admin session", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      `/api/admin/submissions/${UUID}/remove`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.removeWorkshopD1).toHaveBeenCalledWith(env, UUID);
  });

  it("rejects publish with a malformed ID without touching the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/submissions/not-a-uuid/publish",
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.publishWorkshopD1).not.toHaveBeenCalled();
  });

  it("rejects remove with a malformed ID without touching the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/submissions/not-a-uuid/remove",
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.removeWorkshopD1).not.toHaveBeenCalled();
  });

  it("forwards DB failures as a 502 without leaking error text", async () => {
    vi.mocked(d1.publishWorkshopD1).mockRejectedValue(new Error("service_role leaked detail"));
    const cookie = await adminCookie();
    const res = await app.request(
      `/api/admin/submissions/${UUID}/publish`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("service_role leaked detail");
    expect(body.toLowerCase()).toContain("gagal menerbitkan");
  });
});

describe("bulk publish/remove", () => {
  it("accepts a valid UUID list", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/bulk/publish",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID, OTHER_UUID] }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.bulkPublishD1).toHaveBeenCalledWith(env, [UUID, OTHER_UUID]);
  });

  it("drops malformed UUIDs before calling the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/bulk/publish",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID, "not-a-uuid", "123"] }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.bulkPublishD1).toHaveBeenCalledWith(env, [UUID]);
  });

  it("rejects an empty ID list without touching the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/bulk/remove",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.bulkRemoveD1).not.toHaveBeenCalled();
  });

  it("rejects bulk publish without admin", async () => {
    const res = await app.request(
      "/api/admin/bulk/publish",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID] }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.bulkPublishD1).not.toHaveBeenCalled();
  });
});

describe("public workshop API", () => {
  it("returns verified rows from the DB layer", async () => {
    vi.mocked(d1.fetchVerifiedWorkshopsD1).mockResolvedValue([]);
    const res = await app.request("/api/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141", {}, env);
    expect(res.status).toBe(200);
    expect(d1.fetchVerifiedWorkshopsD1).toHaveBeenCalled();
    expect(d1.fetchUnverifiedD1).not.toHaveBeenCalled();
  });

  it("rejects invalid bbox", async () => {
    const res = await app.request("/api/workshops?minLat=6&maxLat=-11", {}, env);
    expect(res.status).toBe(400);
  });
});

describe("submissions", () => {
  it("rejects unauthenticated submissions", async () => {
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validSubmissionBody()) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.insertWorkshopD1).not.toHaveBeenCalled();
  });

  it("rejects an out-of-Indonesia submission without inserting", async () => {
    const cookie = loggedInCookie();
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ...validSubmissionBody(), lat: 7 }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.insertWorkshopD1).not.toHaveBeenCalled();
  });

  it("inserts as the logged-in user, never trusting a client-supplied user_id", async () => {
    vi.mocked(d1.insertWorkshopD1).mockResolvedValue({} as never);
    const cookie = loggedInCookie();
    const res = await app.request(
      "/api/submissions",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...validSubmissionBody(), user_id: "someone-else" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.insertWorkshopD1).toHaveBeenCalledWith(env, FAKE_USER.id, expect.objectContaining({ name: "Tambal Ban Jaya" }));
  });

  it("forwards DB failures as 502 without leaking error text", async () => {
    vi.mocked(d1.insertWorkshopD1).mockRejectedValue(new Error("insert detail"));
    const cookie = loggedInCookie();
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(validSubmissionBody()) },
      env,
    );
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("insert detail");
    expect(body.toLowerCase()).toContain("gagal menyimpan");
  });
});

describe("image upload", () => {
  it("resizes to webp before uploading to R2", async () => {
    vi.mocked(r2.uploadWorkshopImage).mockResolvedValue("https://tambalban-web.antsf.workers.dev/images/workshops/x.webp");
    const cookie = loggedInCookie();
    const form = new FormData();
    form.append("file", new File([new Uint8Array(8)], "photo.png", { type: "image/png" }));
    const res = await app.request(
      "/api/upload",
      { method: "POST", headers: { Cookie: cookie }, body: form },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://tambalban-web.antsf.workers.dev/images/workshops/x.webp" });
    expect(resizeUploadImage).toHaveBeenCalledTimes(1);
    const uploaded = vi.mocked(r2.uploadWorkshopImage).mock.calls[0];
    expect(uploaded[1]).toBeInstanceOf(ArrayBuffer);
    expect(uploaded[2]).toBe("image/webp");
    expect(uploaded[3]).toBe("webp");
  });

  it("rejects an undecodable image as a 400 client error", async () => {
    vi.mocked(resizeUploadImage).mockImplementation(() => {
      throw new Error("bad image");
    });
    const cookie = loggedInCookie();
    const form = new FormData();
    form.append("file", new File([new Uint8Array(8)], "x.jpg", { type: "image/jpeg" }));
    const res = await app.request(
      "/api/upload",
      { method: "POST", headers: { Cookie: cookie }, body: form },
      env,
    );
    expect(res.status).toBe(400);
    expect(r2.uploadWorkshopImage).not.toHaveBeenCalled();
  });

  it("does not leak the underlying upload error to the client", async () => {
    vi.mocked(resizeUploadImage).mockReturnValue(new Uint8Array([9]).buffer as ArrayBuffer);
    vi.mocked(r2.uploadWorkshopImage).mockRejectedValue(new Error("r2 token leak"));
    const cookie = loggedInCookie();
    const form = new FormData();
    form.append("file", new File([new Uint8Array(8)], "x.jpg", { type: "image/jpeg" }));
    const res = await app.request(
      "/api/upload",
      { method: "POST", headers: { Cookie: cookie }, body: form },
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("r2 token leak");
    expect(body).toContain("Gagal mengunggah foto");
  });
});

describe("POST /api/auth/register", () => {
  it("rejects invalid input before touching D1", async () => {
    const res = await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email", password: "short" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.findUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects an already-registered email without creating a user", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({ ...FAKE_USER, password_hash: "hashed:x" });
    const res = await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.createUser).not.toHaveBeenCalled();
  });

  it("creates a user, starts a session, and sets the cookie", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue(null);
    vi.mocked(d1.createUser).mockResolvedValue(FAKE_USER);
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok123", expiresAt: "2026-02-01T00:00:00.000Z" });
    const res = await app.request(
      "/api/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("tb_access_token=tok123");
    expect(res.headers.get("HX-Redirect")).toBe("/submit");
  });
});

describe("POST /api/auth/login", () => {
  it("rejects an unknown email without leaking whether it exists", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue(null);
    const res = await app.request(
      "/api/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("email/password salah");
  });

  it("logs in with correct credentials", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({ ...FAKE_USER, password_hash: "hashed:sandiaman123" });
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok456", expiresAt: "2026-02-01T00:00:00.000Z" });
    const res = await app.request(
      "/api/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("tb_access_token=tok456");
  });

  it("migrate-on-first-login: adopts a D1 password when the legacy Supabase check succeeds", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({ ...FAKE_USER, password_hash: null });
    vi.mocked(legacyAuth.verifyAgainstSupabaseAuth).mockResolvedValue(true);
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok789", expiresAt: "2026-02-01T00:00:00.000Z" });
    const res = await app.request(
      "/api/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "oldpassword1" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.setPasswordHash).toHaveBeenCalledWith(env, FAKE_USER.id, "hashed:oldpassword1");
  });
});

describe("logout", () => {
  it("POST clears the cookie and deletes the D1 session", async () => {
    const cookie = loggedInCookie();
    const res = await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(200);
    expect(d1.deleteSession).toHaveBeenCalledWith(env, FAKE_SESSION_TOKEN);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("GET variant redirects and deletes the D1 session too", async () => {
    const cookie = loggedInCookie();
    const res = await app.request("/api/auth/logout", { headers: { Cookie: cookie } }, env);
    expect(res.status).toBe(302);
    expect(d1.deleteSession).toHaveBeenCalledWith(env, FAKE_SESSION_TOKEN);
  });
});

describe("workshop detail page", () => {
  it("returns not-found page for a malformed id", async () => {
    const res = await app.request("/workshops/not-a-uuid", {}, env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Bengkel tidak ditemukan");
    expect(d1.fetchWorkshopByIdD1).not.toHaveBeenCalled();
  });
});

describe("GET /images/:bucket/:key", () => {
  it("404s on a malformed key without touching R2", async () => {
    const res = await app.request("/images/workshops/../../secret", {}, env);
    expect(res.status).toBe(404);
    expect(env.WORKSHOPS_BUCKET.get).not.toHaveBeenCalled();
  });

  it("404s on an unknown bucket name", async () => {
    const res = await app.request("/images/nope/abc123.webp", {}, env);
    expect(res.status).toBe(404);
  });

  it("404s when the object doesn't exist in R2", async () => {
    vi.mocked(env.WORKSHOPS_BUCKET.get).mockResolvedValue(null);
    const res = await app.request("/images/workshops/abc123.webp", {}, env);
    expect(res.status).toBe(404);
  });

  it("serves the object with its content type and a long-lived cache header", async () => {
    const body = new ReadableStream();
    vi.mocked(env.WORKSHOPS_BUCKET.get).mockResolvedValue({
      body,
      httpMetadata: { contentType: "image/webp" },
    } as unknown as R2ObjectBody);
    const res = await app.request("/images/workshops/abc123.webp", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("routes avatars to the avatars bucket, not workshops", async () => {
    vi.mocked(env.AVATARS_BUCKET.get).mockResolvedValue({
      body: new ReadableStream(),
      httpMetadata: { contentType: "image/webp" },
    } as unknown as R2ObjectBody);
    const res = await app.request("/images/avatars/abc123.webp", {}, env);
    expect(res.status).toBe(200);
    expect(env.AVATARS_BUCKET.get).toHaveBeenCalledWith("abc123.webp");
    expect(env.WORKSHOPS_BUCKET.get).not.toHaveBeenCalled();
  });
});