import { describe, expect, it, vi, beforeEach } from "vitest";
import { appD1 } from "./routes-d1";
import * as d1 from "./lib/d1";
import * as legacyAuth from "./lib/legacy-auth";
import type { Env } from "./lib/env";

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
};

const UUID = "50493a0c-45be-480e-84f0-67814df98f29";

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
