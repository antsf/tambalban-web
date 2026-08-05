import { supabase } from "@/lib/supabase/client";
import { submissionSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_SUBMISSIONS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  const limit = rateLimit(`submit:${clientIp(request)}`, MAX_SUBMISSIONS, WINDOW_MS);
  if (!limit.ok) {
    return Response.json(
      { error: "Terlalu banyak kiriman. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Data tidak valid", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { data, error } = await supabase
    .from("workshop_submissions")
    .insert({
      name: input.name,
      phone: input.phone,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      is_24h: input.is_24h,
      open_time: input.is_24h ? null : (input.open_time ?? null),
      close_time: input.is_24h ? null : (input.close_time ?? null),
      notes: input.notes ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { error: `Gagal menyimpan kiriman: ${error.message}` },
      { status: 500 },
    );
  }

  return Response.json({ id: data.id, status: "pending" }, { status: 201 });
}
