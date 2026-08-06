import type { Env } from "./env";

export interface AuthResult {
  ok: boolean;
  error?: string;
  accessToken?: string;
  email?: string;
}

/** Register with Supabase Auth — the SAME user store as the Android app. */
export async function register(env: Env, email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as {
    error?: string;
    msg?: string;
    access_token?: string;
    user?: { email?: string } | null;
  };
  if (!res.ok) return { ok: false, error: data.error ?? data.msg ?? `HTTP ${res.status}` };
  return {
    ok: true,
    accessToken: data.access_token,
    email: data.user?.email,
  };
}

/** Log in with email + password, returns a bearer token for subsequent inserts. */
export async function login(env: Env, email: string, password: string): Promise<AuthResult> {
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const data = (await res.json()) as {
    error?: string;
    error_description?: string;
    msg?: string;
    access_token?: string;
    user?: { email?: string } | null;
  };
  if (!res.ok)
    return { ok: false, error: data.error_description ?? data.error ?? data.msg ?? `HTTP ${res.status}` };
  return { ok: true, accessToken: data.access_token, email: data.user?.email };
}
