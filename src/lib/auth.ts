import "server-only";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tb_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET wajib diisi (minimal 16 karakter) di .env.local",
    );
  }
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toHex(sig);
}

/** Constant-time string compare — avoids leaking the password via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD belum diset di .env.local");
  }
  return timingSafeEqual(input, expected);
}

/** Issues `<expiresAt>.<hmac>` — no session storage needed. */
export async function createSessionToken(): Promise<{
  token: string;
  maxAge: number;
}> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = await sign(String(expiresAt));
  return {
    token: `${expiresAt}.${signature}`,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  return timingSafeEqual(signature, await sign(expiresAt));
}

/** Reads the cookie jar and verifies the session. Use in admin pages/routes. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
