import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSessionCookie,
  setSessionCookie,
  isAdmin,
  clearSessionCookie,
  validateAdminPassword,
} from "./admin-auth";

const SECRET = "test-secret-that-is-long-enough-for-hmac-1234";

afterEach(() => vi.useRealTimers());

describe("session cookie", () => {
  it("signs a cookie that verifies", async () => {
    const cookie = await setSessionCookie(SECRET, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/admin");
    expect(cookie).toContain("Secure");
    expect(getSessionCookie(cookie)).not.toBeNull();
    expect(await isAdmin(cookie, SECRET)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await setSessionCookie(SECRET, false);
    const token = getSessionCookie(cookie)!;
    const [payload, sig] = token.split(".");
    const tampered = cookie.replace(token, `${payload}.${sig}ff`);
    expect(await isAdmin(tampered, SECRET)).toBe(false);
  });

  it("rejects with the wrong secret", async () => {
    const cookie = await setSessionCookie(SECRET, false);
    expect(await isAdmin(cookie, "another-secret")).toBe(false);
  });

  it("rejects malformed cookies", async () => {
    expect(await isAdmin("tb_admin_session=nodothere", SECRET)).toBe(false);
    expect(await isAdmin("tb_admin_session=.missing-payload", SECRET)).toBe(false);
    expect(await isAdmin(null, SECRET)).toBe(false);
    expect(await isAdmin(undefined, SECRET)).toBe(false);
  });

  it("expires after 8 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:00:00Z"));
    const cookie = await setSessionCookie(SECRET, false);
    expect(await isAdmin(cookie, SECRET)).toBe(true);

    vi.setSystemTime(new Date("2026-08-06T08:00:01Z"));
    expect(await isAdmin(cookie, SECRET)).toBe(false);
  });

  it("clearSessionCookie zeroes Max-Age", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });
});

describe("validateAdminPassword", () => {
  it("accepts the correct password", async () => {
    expect(await validateAdminPassword("hunter2", "hunter2")).toBe(true);
  });
  it("rejects a wrong password", async () => {
    expect(await validateAdminPassword("hunter2", "hunter3")).toBe(false);
  });
  it("rejects different lengths", async () => {
    expect(await validateAdminPassword("short", "a-considerably-longer-password")).toBe(false);
  });
});
