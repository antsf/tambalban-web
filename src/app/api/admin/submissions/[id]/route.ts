import { isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewActionSchema } from "@/lib/validation";
import type { WorkshopSubmission } from "@/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const parsed = reviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "action harus 'approve' atau 'reject'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: submission, error: fetchError } = await admin
    .from("workshop_submissions")
    .select("*")
    .eq("id", id)
    .single<WorkshopSubmission>();

  if (fetchError || !submission) {
    return Response.json({ error: "Kiriman tidak ditemukan" }, { status: 404 });
  }

  // Guards against a double-click promoting the same submission twice.
  if (submission.status !== "pending") {
    return Response.json(
      { error: `Kiriman sudah di-${submission.status}` },
      { status: 409 },
    );
  }

  if (parsed.data.action === "reject") {
    const { error } = await admin
      .from("workshop_submissions")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, status: "rejected" });
  }

  const { data: workshop, error: insertError } = await admin
    .from("workshops")
    .insert({
      name: submission.name,
      latitude: submission.latitude,
      longitude: submission.longitude,
      phone: submission.phone,
      address: submission.address,
      open_time: submission.open_time,
      close_time: submission.close_time,
      is_24h: submission.is_24h,
      source: "web",
    })
    .select("id")
    .single();

  if (insertError) {
    return Response.json(
      { error: `Gagal buat workshop: ${insertError.message}` },
      { status: 500 },
    );
  }

  const { error: updateError } = await admin
    .from("workshop_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      approved_workshop_id: workshop.id,
    })
    .eq("id", id);

  if (updateError) {
    // Workshop exists but the submission is still pending — surface it rather
    // than leaving the admin thinking nothing happened.
    return Response.json(
      {
        error: `Workshop dibuat (${workshop.id}) tapi status kiriman gagal diupdate: ${updateError.message}`,
      },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, status: "approved", workshopId: workshop.id });
}
