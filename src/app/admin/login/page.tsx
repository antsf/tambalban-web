"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Login gagal");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-4 py-16">
      <div className="card-brutal w-full p-6">
        <h1 className="text-2xl font-black uppercase">Admin</h1>
        <p className="mt-1 text-sm">Khusus moderator TambalBan.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-black uppercase">
            Password
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-brutal mt-1"
            />
          </label>

          {error && (
            <p className="border-3 border-ink bg-danger px-3 py-2 text-sm font-bold text-white">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-brutal w-full bg-brand px-4 py-2"
          >
            {loading ? "Masuk…" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
