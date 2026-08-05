import { cookies } from "next/headers";
import { ADMIN_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Brute-force guard: 8 attempts per 15 minutes per IP.
  const limit = rateLimit(`login:${clientIp(request)}`, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    return Response.json(
      { error: "Terlalu banyak percobaan. Tunggu sebentar." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Password wajib diisi" }, { status: 400 });
  }

  if (!checkPassword(parsed.data.password)) {
    return Response.json({ error: "Password salah" }, { status: 401 });
  }

  const { token, maxAge } = await createSessionToken();
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return Response.json({ ok: true });
}
