import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="shrink-0 border-t-4 border-ink bg-ink text-paper">
      <div className="stripes h-3 w-full" />
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold uppercase tracking-tight">
          TambalBan — data terbuka tambal ban Indonesia
        </p>
        <div className="flex gap-4">
          <span className="opacity-70">Peta: OpenStreetMap</span>
          <Link href="/admin" className="underline underline-offset-4">
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
