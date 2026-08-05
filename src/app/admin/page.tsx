import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin-dashboard";

export default async function AdminPage() {
  // proxy.ts only checks the cookie exists; this verifies the signature.
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminDashboard />
    </div>
  );
}
