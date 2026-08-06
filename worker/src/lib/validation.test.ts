import { describe, expect, it } from "vitest";
import { submissionSchema, loginSchema, bboxSchema, geocodeSchema } from "./validation";

const validSubmission = {
  name: "Tambal Ban Jaya",
  lat: -6.2,
  lon: 106.8,
  city: "Jakarta",
  motorcycle_tyres: true,
};

describe("submissionSchema", () => {
  it("accepts a valid in-bounds submission", () => {
    const parsed = submissionSchema.safeParse(validSubmission);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Tambal Ban Jaya");
      expect(parsed.data.motorcycle_tyres).toBe(true);
      expect(parsed.data.car_tyres).toBe(false); // default
    }
  });

  it("coerces numeric strings", () => {
    const parsed = submissionSchema.safeParse({ ...validSubmission, lat: "-6.2", lon: "106.8" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lat).toBe(-6.2);
      expect(parsed.data.lon).toBe(106.8);
    }
  });

  it("rejects out-of-Indonesia latitude", () => {
    const r = submissionSchema.safeParse({ ...validSubmission, lat: 7 });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/luar batas/i);
  });

  it("rejects out-of-Indonesia longitude", () => {
    const r = submissionSchema.safeParse({ ...validSubmission, lon: 142 });
    expect(r.success).toBe(false);
  });

  it("rejects a too-short name", () => {
    const r = submissionSchema.safeParse({ ...validSubmission, name: "a" });
    expect(r.success).toBe(false);
  });

  it("treats blank optional fields as undefined", () => {
    const r = submissionSchema.safeParse({ ...validSubmission, city: "", whatsapp: "   " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.city).toBeUndefined();
      expect(r.data.whatsapp).toBeUndefined();
    }
  });
});

describe("loginSchema", () => {
  it("rejects a bad email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "password123" }).success).toBe(false);
  });
  it("rejects a short password", () => {
    expect(loginSchema.safeParse({ email: "a@b.c", password: "short" }).success).toBe(false);
  });
  it("accepts a valid login", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "password123" }).success).toBe(true);
  });
});

describe("geocodeSchema", () => {
  it("requires at least 3 chars", () => {
    expect(geocodeSchema.safeParse({ q: "ab" }).success).toBe(false);
    expect(geocodeSchema.safeParse({ q: "abc" }).success).toBe(true);
  });
});

describe("bboxSchema", () => {
  it("rejects minLat > maxLat", () => {
    expect(bboxSchema.safeParse({ minLat: 6, maxLat: -11 }).success).toBe(false);
  });
  it("accepts partial bbox", () => {
    expect(bboxSchema.safeParse({ minLat: -6 }).success).toBe(true);
  });
});
