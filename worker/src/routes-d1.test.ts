import { describe, expect, it, vi, beforeEach } from "vitest";
import { appD1 } from "./routes-d1";
import * as d1 from "./lib/d1";
import * as r2 from "./lib/r2";
import { resizeUploadImage } from "./lib/image";
import * as legacyAuth from "./lib/legacy-auth";
import { setSessionCookie } from "./lib/admin-auth";
import type { Env } from "./lib/env";

vi.mock("./lib/r2", () => ({
  uploadWorkshopImage: vi.fn(),
  uploadAvatarImage: vi.fn(),
}));

vi.mock("./lib/image", () => ({
  resizeUploadImage: vi.fn(() => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer as ArrayBuffer),
}));

vi.mock("./lib/d1", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (p: string, h: string) => h === `hashed:${p}`),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  setPasswordHash: vi.fn(),
  createSession: vi.fn(),
  getSessionUser: vi.fn(),
  deleteSession: vi.fn(),
  fetchVerifiedWorkshopsD1: vi.fn(),
  fetchWorkshopByIdD1: vi.fn(),
  fetchReviewsD1: vi.fn(),
  insertWorkshopD1: vi.fn(),
  insertReviewD1: vi.fn(),
  updateProfileD1: vi.fn(),
  fetchUnverifiedD1: vi.fn(),
  fetchAllWorkshopsD1: vi.fn(),
  publishWorkshopD1: vi.fn(),
  removeWorkshopD1: vi.fn(),
  bulkPublishD1: vi.fn(),
  bulkRemoveD1: vi.fn(),
  toWorkshop: vi.fn((r: any) => ({
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
  })),
}));

vi.mock("./lib/legacy-auth", () => ({
  verifyAgainstSupabaseAuth: vi.fn(),
}));

const env: Env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  ADMIN_PASSWORD: "hunter2",
  ADMIN_SESSION_SECRET: "test-secret",
  DB: {} as unknown as D1Database,
  WORKSHOPS_BUCKET: {} as unknown as R2Bucket,
  AVATARS_BUCKET: {} as unknown as R2Bucket,
};

const UUID = "50493a0c-45be-480e-84f0-67814df98f29";

const testUser = {
  id: UUID,
  email: "budi@example.com",
  username: null,
  full_name: null,
  phone: null,
  avatar_url: null,
  created_at: "",
  updated_at: "",
};

async function adminCookie(): Promise<string> {
  const cookie = await setSessionCookie(env.ADMIN_SESSION_SECRET, false);
  return cookie.split(";")[0];
}

function validSubmissionBody() {
  return {
    name: "Tambal Ban Jaya",
    lat: -6.2,
    lon: 106.8,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v2/auth/register", () => {
  it("creates a user and returns a session token", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue(null);
    vi.mocked(d1.createUser).mockResolvedValue({
      id: UUID,
      email: "budi@example.com",
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok123", expiresAt: "2026-02-01T00:00:00.000Z" });

    const res = await appD1.request(
      "/api/v2/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "budi@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBe("tok123");
    expect(body.user.email).toBe("budi@example.com");
    expect(d1.hashPassword).toHaveBeenCalledWith("sandiaman123");
  });

  it("rejects an already-registered email without creating a user", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({
      id: UUID,
      email: "budi@example.com",
      password_hash: "hashed:x",
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    const res = await appD1.request(
      "/api/v2/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "budi@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.createUser).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the DB", async () => {
    const res = await appD1.request(
      "/api/v2/auth/register",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "not-an-email", password: "short" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/auth/login", () => {
  it("logs in with correct credentials", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({
      id: UUID,
      email: "budi@example.com",
      password_hash: "hashed:sandiaman123",
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok456", expiresAt: "2026-02-01T00:00:00.000Z" });

    const res = await appD1.request(
      "/api/v2/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "budi@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBe("tok456");
    expect(body.user.password_hash).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({
      id: UUID,
      email: "budi@example.com",
      password_hash: "hashed:sandiaman123",
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    const res = await appD1.request(
      "/api/v2/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "budi@example.com", password: "salahsandi" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.createSession).not.toHaveBeenCalled();
  });

  it("rejects an unknown email without leaking whether it exists", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue(null);
    const res = await appD1.request(
      "/api/v2/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.com", password: "sandiaman123" }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Email/password salah");
  });

  it("migrate-on-first-login: adopts a D1 password when the legacy Supabase check succeeds", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({
      id: UUID,
      email: "migrated@example.com",
      password_hash: null,
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(legacyAuth.verifyAgainstSupabaseAuth).mockResolvedValue(true);
    vi.mocked(d1.createSession).mockResolvedValue({ token: "tok789", expiresAt: "2026-02-01T00:00:00.000Z" });

    const res = await appD1.request(
      "/api/v2/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "migrated@example.com", password: "oldpassword1" }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(legacyAuth.verifyAgainstSupabaseAuth).toHaveBeenCalledWith(env, "migrated@example.com", "oldpassword1");
    expect(d1.setPasswordHash).toHaveBeenCalledWith(env, UUID, "hashed:oldpassword1");
    expect(d1.createSession).toHaveBeenCalledWith(env, UUID);
  });

  it("migrate-on-first-login: rejects without adopting a password when the legacy check fails", async () => {
    vi.mocked(d1.findUserByEmail).mockResolvedValue({
      id: UUID,
      email: "migrated@example.com",
      password_hash: null,
      username: null,
      full_name: null,
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(legacyAuth.verifyAgainstSupabaseAuth).mockResolvedValue(false);

    const res = await appD1.request(
      "/api/v2/auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "migrated@example.com", password: "wrongpassword" }) },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Email/password salah");
    expect(d1.setPasswordHash).not.toHaveBeenCalled();
    expect(d1.createSession).not.toHaveBeenCalled();
  });
});

describe("GET /api/v2/profile", () => {
  it("rejects a missing bearer token", async () => {
    const res = await appD1.request("/api/v2/profile", {}, env);
    expect(res.status).toBe(401);
    expect(d1.getSessionUser).not.toHaveBeenCalled();
  });

  it("returns the session's user with a valid token", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue({
      id: UUID,
      email: "budi@example.com",
      username: "budi",
      full_name: "Budi",
      phone: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
    const res = await appD1.request("/api/v2/profile", { headers: { Authorization: "Bearer tok123" } }, env);
    expect(res.status).toBe(200);
    expect(d1.getSessionUser).toHaveBeenCalledWith(env, "tok123");
  });

  it("rejects an expired/invalid token", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(null);
    const res = await appD1.request("/api/v2/profile", { headers: { Authorization: "Bearer bad" } }, env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v2/workshops", () => {
  it("returns rows from the D1 layer", async () => {
    vi.mocked(d1.fetchVerifiedWorkshopsD1).mockResolvedValue([]);
    const res = await appD1.request("/api/v2/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141", {}, env);
    expect(res.status).toBe(200);
    expect(d1.fetchVerifiedWorkshopsD1).toHaveBeenCalled();
  });

  it("rejects an invalid bbox", async () => {
    const res = await appD1.request("/api/v2/workshops?minLat=6&maxLat=-11", {}, env);
    expect(res.status).toBe(400);
    expect(d1.fetchVerifiedWorkshopsD1).not.toHaveBeenCalled();
  });
});

describe("GET /api/v2/workshops/:id", () => {
  it("rejects a malformed id without querying D1", async () => {
    const res = await appD1.request("/api/v2/workshops/not-a-uuid", {}, env);
    expect(res.status).toBe(400);
    expect(d1.fetchWorkshopByIdD1).not.toHaveBeenCalled();
  });

  it("returns 404 when the row doesn't exist (or isn't verified)", async () => {
    vi.mocked(d1.fetchWorkshopByIdD1).mockResolvedValue(null);
    const res = await appD1.request(`/api/v2/workshops/${UUID}`, {}, env);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v2/workshops", () => {
  it("rejects without a bearer token, never inserting", async () => {
    const res = await appD1.request(
      "/api/v2/workshops",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validSubmissionBody()) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.insertWorkshopD1).not.toHaveBeenCalled();
  });

  it("rejects an out-of-Indonesia-bounds submission", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    const res = await appD1.request(
      "/api/v2/workshops",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
        body: JSON.stringify({ name: "Jakarta Shop", lat: 50, lon: 50 }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.insertWorkshopD1).not.toHaveBeenCalled();
  });

  it("inserts as the logged-in user and returns the created row", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(d1.insertWorkshopD1).mockResolvedValue({
      id: UUID, name: "Tambal Ban Jaya", lat: -6.2, lon: 106.8, address: null, city: null,
      province: null, district: null, phone: null, whatsapp: null, website: null, instagram: null,
      opening_hours: null, image_url: null, source: "user", verified: 0, verified_at: null,
      motorcycle_tyres: 0, car_tyres: 0, truck_tyres: 0, tubeless_repair: 0, vulcanizer: 0,
      balancing: 0, spooring: 0, roadside_service: 0, created_at: "", updated_at: "",
    });
    const res = await appD1.request(
      "/api/v2/workshops",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
        body: JSON.stringify(validSubmissionBody()),
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(d1.insertWorkshopD1).toHaveBeenCalledWith(env, UUID, expect.objectContaining({ name: "Tambal Ban Jaya" }));
    const bodyOut = (await res.json()) as any;
    expect(bodyOut.verified).toBe(false);
  });
});

describe("POST /api/v2/workshops/:id/reviews", () => {
  it("rejects without a bearer token", async () => {
    const res = await appD1.request(
      `/api/v2/workshops/${UUID}/reviews`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 5 }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.insertReviewD1).not.toHaveBeenCalled();
  });

  it("rejects a rating out of 1..5", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    const res = await appD1.request(
      `/api/v2/workshops/${UUID}/reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
        body: JSON.stringify({ rating: 9 }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.insertReviewD1).not.toHaveBeenCalled();
  });

  it("stamps user_id from the session, not the request body", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(d1.insertReviewD1).mockResolvedValue({
      id: "r1", workshop_id: UUID, user_id: UUID, rating: 5, comment: "Mantap", created_at: "",
    });
    const res = await appD1.request(
      `/api/v2/workshops/${UUID}/reviews`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
        body: JSON.stringify({ rating: 5, comment: "Mantap", user_id: "someone-else" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    expect(d1.insertReviewD1).toHaveBeenCalledWith(env, UUID, UUID, 5, "Mantap");
  });
});

describe("PATCH /api/v2/profile", () => {
  it("rejects without a bearer token", async () => {
    const res = await appD1.request(
      "/api/v2/profile",
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "budi" }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.updateProfileD1).not.toHaveBeenCalled();
  });

  it("updates profile fields for the session's own user", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(d1.updateProfileD1).mockResolvedValue({ ...testUser, username: "budi" });
    const res = await appD1.request(
      "/api/v2/profile",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
        body: JSON.stringify({ username: "budi" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.updateProfileD1).toHaveBeenCalledWith(env, UUID, expect.objectContaining({ username: "budi" }));
  });
});

describe("admin routes", () => {
  it("GET /api/v2/admin/submissions rejects without an admin cookie", async () => {
    const res = await appD1.request("/api/v2/admin/submissions", {}, env);
    expect(res.status).toBe(401);
    expect(d1.fetchUnverifiedD1).not.toHaveBeenCalled();
  });

  it("GET /api/v2/admin/submissions returns the queue with a valid admin cookie", async () => {
    vi.mocked(d1.fetchUnverifiedD1).mockResolvedValue([]);
    const res = await appD1.request("/api/v2/admin/submissions", { headers: { Cookie: await adminCookie() } }, env);
    expect(res.status).toBe(200);
    expect(d1.fetchUnverifiedD1).toHaveBeenCalled();
  });

  it("POST .../publish rejects without an admin cookie, never touching the row", async () => {
    const res = await appD1.request(`/api/v2/admin/submissions/${UUID}/publish`, { method: "POST" }, env);
    expect(res.status).toBe(401);
    expect(d1.publishWorkshopD1).not.toHaveBeenCalled();
  });

  it("POST .../publish flips verified=1 with a valid admin cookie", async () => {
    const res = await appD1.request(
      `/api/v2/admin/submissions/${UUID}/publish`,
      { method: "POST", headers: { Cookie: await adminCookie() } },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.publishWorkshopD1).toHaveBeenCalledWith(env, UUID);
  });

  it("POST .../publish rejects a non-UUID id before touching D1", async () => {
    const res = await appD1.request(
      "/api/v2/admin/submissions/not-a-uuid/publish",
      { method: "POST", headers: { Cookie: await adminCookie() } },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.publishWorkshopD1).not.toHaveBeenCalled();
  });

  it("POST .../remove deletes the row with a valid admin cookie", async () => {
    const res = await appD1.request(
      `/api/v2/admin/submissions/${UUID}/remove`,
      { method: "POST", headers: { Cookie: await adminCookie() } },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.removeWorkshopD1).toHaveBeenCalledWith(env, UUID);
  });

  it("bulk publish drops non-UUID entries and rejects an empty result", async () => {
    const res = await appD1.request(
      "/api/v2/admin/bulk/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: await adminCookie() },
        body: JSON.stringify({ ids: ["not-a-uuid", 42, null] }),
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(d1.bulkPublishD1).not.toHaveBeenCalled();
  });

  it("bulk publish accepts valid UUIDs and filters out invalid ones", async () => {
    const res = await appD1.request(
      "/api/v2/admin/bulk/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: await adminCookie() },
        body: JSON.stringify({ ids: [UUID, "not-a-uuid"] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(d1.bulkPublishD1).toHaveBeenCalledWith(env, [UUID]);
  });

  it("bulk remove requires an admin cookie", async () => {
    const res = await appD1.request(
      "/api/v2/admin/bulk/remove",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID] }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(d1.bulkRemoveD1).not.toHaveBeenCalled();
  });
});

function uploadForm(): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(8)], "photo.png", { type: "image/png" }));
  return form;
}

describe("POST /api/v2/upload/workshop", () => {
  it("rejects without a bearer token", async () => {
    const res = await appD1.request("/api/v2/upload/workshop", { method: "POST", body: uploadForm() }, env);
    expect(res.status).toBe(401);
    expect(r2.uploadWorkshopImage).not.toHaveBeenCalled();
  });

  it("resizes to webp and uploads to the workshops bucket", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(r2.uploadWorkshopImage).mockResolvedValue("https://tambalban-web.antsf.workers.dev/images/workshops/x.webp");
    const res = await appD1.request(
      "/api/v2/upload/workshop",
      { method: "POST", headers: { Authorization: "Bearer tok123" }, body: uploadForm() },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://tambalban-web.antsf.workers.dev/images/workshops/x.webp" });
    expect(resizeUploadImage).toHaveBeenCalledTimes(1);
    expect(r2.uploadAvatarImage).not.toHaveBeenCalled();
  });

  it("rejects an undecodable image as a 400 client error", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(resizeUploadImage).mockImplementationOnce(() => {
      throw new Error("bad image");
    });
    const res = await appD1.request(
      "/api/v2/upload/workshop",
      { method: "POST", headers: { Authorization: "Bearer tok123" }, body: uploadForm() },
      env,
    );
    expect(res.status).toBe(400);
    expect(r2.uploadWorkshopImage).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/upload/avatar", () => {
  it("rejects without a bearer token", async () => {
    const res = await appD1.request("/api/v2/upload/avatar", { method: "POST", body: uploadForm() }, env);
    expect(res.status).toBe(401);
    expect(r2.uploadAvatarImage).not.toHaveBeenCalled();
  });

  it("resizes to webp and uploads to the avatars bucket, not workshops", async () => {
    vi.mocked(d1.getSessionUser).mockResolvedValue(testUser);
    vi.mocked(r2.uploadAvatarImage).mockResolvedValue("https://tambalban-web.antsf.workers.dev/images/avatars/x.webp");
    const res = await appD1.request(
      "/api/v2/upload/avatar",
      { method: "POST", headers: { Authorization: "Bearer tok123" }, body: uploadForm() },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://tambalban-web.antsf.workers.dev/images/avatars/x.webp" });
    expect(r2.uploadWorkshopImage).not.toHaveBeenCalled();
  });
});
