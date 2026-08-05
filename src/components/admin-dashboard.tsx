"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmissionStatus, WorkshopSubmission } from "@/types";
import { formatCoords, formatDate, formatHours } from "@/lib/format";

const TABS: { key: SubmissionStatus; label: string }[] = [
  { key: "pending", label: "Menunggu" },
  { key: "approved", label: "Disetujui" },
  { key: "rejected", label: "Ditolak" },
];

export function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<SubmissionStatus>("pending");
  const [submissions, setSubmissions] = useState<WorkshopSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(status: SubmissionStatus) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/submissions?status=${status}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat data");
      setSubmissions(json.submissions as WorkshopSubmission[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred so setLoading/setSubmissions never run synchronously inside
    // the effect body itself — only from this callback.
    const id = setTimeout(() => void load(tab), 0);
    return () => clearTimeout(id);
  }, [tab]);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal update kiriman");
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update kiriman");
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-black uppercase tracking-tight">
          Review Kiriman
        </h1>
        <button
          onClick={() => void logout()}
          className="btn-brutal bg-white px-3 py-2 text-xs"
        >
          Keluar
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn-brutal px-4 py-2 text-sm ${
              tab === t.key ? "bg-brand" : "bg-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 border-3 border-ink bg-danger px-3 py-2 text-sm font-bold text-white">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {loading && <p className="font-bold">Memuat…</p>}
        {!loading && submissions.length === 0 && (
          <p className="card-brutal p-4 font-bold">
            Tidak ada kiriman berstatus &quot;{tab}&quot;.
          </p>
        )}

        {submissions.map((s) => (
          <div key={s.id} className="card-brutal p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-black uppercase">{s.name}</p>
                <p className="text-sm">{s.address}</p>
                <p className="mt-1 text-xs font-bold">{formatHours(s)}</p>
                <p className="font-mono text-xs">
                  {formatCoords(s.latitude, s.longitude)}
                </p>
                <p className="text-xs">Telp: {s.phone}</p>
                {s.notes && <p className="mt-1 text-xs italic">“{s.notes}”</p>}
                <p className="mt-1 text-xs opacity-70">
                  Dikirim {formatDate(s.created_at)}
                </p>
              </div>

              {tab === "pending" && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void review(s.id, "approve")}
                    disabled={busyId === s.id}
                    className="btn-brutal bg-ok px-3 py-2 text-xs text-white"
                  >
                    Setujui
                  </button>
                  <button
                    onClick={() => void review(s.id, "reject")}
                    disabled={busyId === s.id}
                    className="btn-brutal bg-danger px-3 py-2 text-xs text-white"
                  >
                    Tolak
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
