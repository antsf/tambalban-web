import type { Metadata } from "next";
import { SubmitForm } from "@/components/submit-form";

export const metadata: Metadata = {
  title: "Tambah Tambal Ban — TambalBan",
};

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight sm:text-4xl">
        Tambah Tambal Ban
      </h1>
      <p className="mt-1 max-w-2xl font-medium">
        Isi data tambal ban yang kamu tahu. Tim akan review sebelum tampil di
        peta dan aplikasi TambalBan.
      </p>

      <div className="mt-6">
        <SubmitForm />
      </div>
    </div>
  );
}
