import type { Env } from "./env";

const COOKIE_NAME = "tb_admin_session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // bounded session: 8h

function encodeBase64Url(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  return atob(data.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmacSha256(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  return toHex(await hmacSha256(secret, payload));
}

function currentSessionPayload(): string {
  return encodeBase64Url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS }));
}

export function getSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

export async function setSessionCookie(secret: string, secure: boolean): Promise<string> {
  const payload = currentSessionPayload();
  const sig = await sign(payload, secret);
  return [
    `${COOKIE_NAME}=${payload}.${sig}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    secure ? `Secure` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export async function isAdmin(cookieHeader: string | null | undefined, secret: string): Promise<boolean> {
  const token = getSessionCookie(cookieHeader);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(payload, secret);
  if (!constantTimeEqual(provided, expected)) return false;
  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now() / 1000) return false;
  } catch {
    return false;
  }
  return true;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function validateAdminPassword(provided: string, expected: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("tambalban-admin-pw"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(provided)),
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expected)),
  ]);
  return constantTimeEqual(toHex(a), toHex(b));
}
