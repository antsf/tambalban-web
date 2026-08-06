const USER_COOKIE = "tb_access_token";

export function getCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function getUserToken(cookieHeader: string | null | undefined): string | null {
  return getCookie(cookieHeader, USER_COOKIE);
}

function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  return atob(data.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

function decodeJwtPayload(token: string): { email?: string; exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1])) as { email?: string; exp?: number };
  } catch {
    return null;
  }
}

/** Returns the logged-in user's email from an unexpired access token, else null. */
export function userEmailFromToken(token: string | null): string | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
  return payload.email ?? null;
}

export function userTokenCookie(token: string, secure: boolean): string {
  const payload = decodeJwtPayload(token);
  const maxAge = payload?.exp ? Math.max(0, Math.round(payload.exp - Date.now() / 1000)) : 3600;
  return `${USER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearUserTokenCookie(): string {
  return `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
