import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./d1";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("sandiaman123");
    expect(await verifyPassword("sandiaman123", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("sandiaman123");
    expect(await verifyPassword("salahsandi", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("sandiaman123");
    const b = await hashPassword("sandiaman123");
    expect(a).not.toBe(b);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });
});
