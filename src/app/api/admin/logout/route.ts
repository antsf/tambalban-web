import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return Response.json({ ok: true });
}
