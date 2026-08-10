import { describe, expect, it, vi, beforeEach } from "vitest";
import { app } from "./routes";
import * as db from "./lib/supabase";
import type { Env } from "./lib/env";
import { setSessionCookie } from "./lib/admin-auth";

vi.mock("./lib/supabase", () => ({
  fetchVerifiedWorkshops: vi.fn(),
  fetchWorkshopById: vi.fn(),
  fetchUnverifiedSubmissions: vi.fn(),
  fetchAllWorkshops: vi.fn(),
  insertSubmission: vi.fn(),
  uploadImage: vi.fn(),
  publishSubmission: vi.fn(),
  removeSubmission: vi.fn(),
  bulkPublish: vi.fn(),
  bulkRemove: vi.fn(),
  fetchAuthUsers: vi.fn(),
  fetchAllReviews: vi.fn(),
}));

vi.mock("./lib/supabase-auth", () => ({
  register: vi.fn(),
  login: vi.fn(),
}));

const env: Env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  ADMIN_PASSWORD: "hunter2",
  ADMIN_SESSION_SECRET: "test-secret",
};

const UUID = "50493a0c-45be-480e-84f0-67814df98f29";
const OTHER_UUID = "50493a0c-45be-480e-84f0-67814df98f30";

function b64url(s: string): string {
  // Workers runtime has no Buffer; implement base64url for ASCII payloads.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeUserToken(email: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${header}.${payload}.${b64url("fake-signature")}`;
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
    expect(db.publishSubmission).not.toHaveBeenCalled();
  });

  it("rejects remove without an admin session", async () => {
    const res = await app.request(`/api/admin/submissions/${UUID}/remove`, { method: "POST" }, env);
    expect(res.status).toBe(401);
    expect(db.removeSubmission).not.toHaveBeenCalled();
  });

  it("publishes a submission with a valid admin session", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      `/api/admin/submissions/${UUID}/publish`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.publishSubmission).toHaveBeenCalledWith(env, UUID);
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
    expect(db.removeSubmission).toHaveBeenCalledWith(env, UUID);
  });

  it("forwards DB failures as a 502 without leaking error text", async () => {
    vi.mocked(db.publishSubmission).mockRejectedValue(new Error("service_role leaked detail"));
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
    expect(db.bulkPublish).toHaveBeenCalledWith(env, [UUID, OTHER_UUID]);
  });

  it("drops malformed UUIDs before calling the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/bulk/publish",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID, "not-a-uuid", "123"] }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(db.bulkPublish).toHaveBeenCalledWith(env, [UUID]);
  });

  it("rejects an empty ID list without touching the DB", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/admin/bulk/remove",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [] }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(db.bulkRemove).not.toHaveBeenCalled();
  });

  it("rejects bulk publish without admin", async () => {
    const res = await app.request(
      "/api/admin/bulk/publish",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [UUID] }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(db.bulkPublish).not.toHaveBeenCalled();
  });
});

describe("public workshop API", () => {
  it("returns verified rows from the DB layer", async () => {
    vi.mocked(db.fetchVerifiedWorkshops).mockResolvedValue([]);
    const res = await app.request("/api/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141", {}, env);
    expect(res.status).toBe(200);
    expect(db.fetchVerifiedWorkshops).toHaveBeenCalled();
    expect(db.fetchUnverifiedSubmissions).not.toHaveBeenCalled();
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
    expect(db.insertSubmission).not.toHaveBeenCalled();
  });

  it("rejects an out-of-Indonesia submission without inserting", async () => {
    const cookie = `tb_access_token=${fakeUserToken("user@example.com")}`;
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ...validSubmissionBody(), lat: 7 }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(db.insertSubmission).not.toHaveBeenCalled();
  });

  it("always sends source=user and verified=false for user submissions", async () => {
    vi.mocked(db.insertSubmission).mockResolvedValue({} as never);
    const cookie = `tb_access_token=${fakeUserToken("user@example.com")}`;
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(validSubmissionBody()) },
      env,
    );
    expect(res.status).toBe(200);
    const [, , row] = vi.mocked(db.insertSubmission).mock.calls[0];
    expect(row.source).toBe("user");
    expect(row.verified).toBe(false);
  });

  it("forwards DB failures as 502 without leaking error text", async () => {
    vi.mocked(db.insertSubmission).mockRejectedValue(new Error("insert RLS detail"));
    const cookie = `tb_access_token=${fakeUserToken("user@example.com")}`;
    const res = await app.request(
      "/api/submissions",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(validSubmissionBody()) },
      env,
    );
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain("insert RLS detail");
    expect(body.toLowerCase()).toContain("gagal menyimpan");
  });
});

describe("image upload", () => {
  it("does not leak the underlying upload error to the client", async () => {
    vi.mocked(db.uploadImage).mockRejectedValue(new Error("supabase-storage token leak"));
    const cookie = `tb_access_token=${fakeUserToken("user@example.com")}`;
    const form = new FormData();
    form.append("file", new File([""], "x.jpg", { type: "image/jpeg" }));
    const res = await app.request(
      "/api/upload",
      { method: "POST", headers: { Cookie: cookie }, body: form },
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("supabase-storage token leak");
    expect(body).toContain("Gagal mengunggah foto");
  });
});

describe("workshop detail page", () => {
  it("returns not-found page for a malformed id", async () => {
    const res = await app.request("/workshops/not-a-uuid", {}, env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Bengkel tidak ditemukan");
    expect(db.fetchWorkshopById).not.toHaveBeenCalled();
  });
});