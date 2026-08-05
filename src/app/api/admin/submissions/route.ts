import { isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubmissionStatus } from "@/types";

const STATUSES: SubmissionStatus[] = ["pending", "approved", "rejected"];

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const statusParam = new URL(request.url).searchParams.get("status");
  const status = STATUSES.includes(statusParam as SubmissionStatus)
    ? (statusParam as SubmissionStatus)
    : "pending";

  const { data, error } = await createAdminClient()
    .from("workshop_submissions")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ submissions: data ?? [] });
}
