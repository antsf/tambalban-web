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

/**
 * D1 session tokens are opaque (lib/d1.ts's createSession) — unlike the Supabase JWT this
 * replaced, there's no embedded expiry/email to decode client-side. Resolving a token to a
 * user always means a `d1.getSessionUser` lookup (see routes.ts's getD1SessionUser).
 */
export function userTokenCookie(token: string, expiresAt: string, secure: boolean): string {
  const maxAge = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return `${USER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearUserTokenCookie(): string {
  return `${USER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
