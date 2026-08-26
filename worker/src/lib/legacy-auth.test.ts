import { describe, expect, it, vi, afterEach } from "vitest";
import { verifyAgainstSupabaseAuth } from "./legacy-auth";
import type { Env } from "./env";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
} as Env;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyAgainstSupabaseAuth", () => {
  it("returns true when Supabase Auth accepts the credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await verifyAgainstSupabaseAuth(env, "user@example.com", "oldpassword1");
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/auth/v1/token?grant_type=password");
    expect(init.headers.apikey).toBe("anon-key");
    expect(JSON.parse(init.body)).toEqual({ email: "user@example.com", password: "oldpassword1" });
  });

  it("returns false when Supabase Auth rejects the credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    expect(await verifyAgainstSupabaseAuth(env, "user@example.com", "wrong")).toBe(false);
  });
});
