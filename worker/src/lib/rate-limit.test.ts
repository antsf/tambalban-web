import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, clientIp } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("rateLimit", () => {
  it("allows up to the limit, then rejects", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3)).toBe(true);
    expect(rateLimit("k", 3)).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(rateLimit("a", 1)).toBe(true);
    expect(rateLimit("a", 1)).toBe(false);
    expect(rateLimit("b", 1)).toBe(true);
  });

  it("resets after the 60s window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T00:00:00Z"));
    expect(rateLimit("w", 1)).toBe(true);
    expect(rateLimit("w", 1)).toBe(false);
    vi.setSystemTime(new Date("2026-08-06T00:01:01Z"));
    expect(rateLimit("w", 1)).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://example.test/", {
      headers: { "CF-Connecting-IP": "203.0.113.7", "x-forwarded-for": "10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });
  it("falls back to x-forwarded-for", () => {
    const req = new Request("https://example.test/", {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });
  it("defaults to unknown", () => {
    expect(clientIp(new Request("https://example.test/"))).toBe("unknown");
  });
});
