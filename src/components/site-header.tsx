import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="shrink-0 border-b-4 border-ink bg-brand">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center border-3 border-ink bg-ink text-lg font-black text-brand">
            TB
          </span>
          <span className="text-xl font-black uppercase tracking-tight">
            TambalBan
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="btn-brutal bg-white px-3 py-2 text-xs sm:text-sm"
          >
            Peta
          </Link>
          <Link
            href="/submit"
            className="btn-brutal bg-accent px-3 py-2 text-xs text-white sm:text-sm"
          >
            + Tambah
          </Link>
        </nav>
      </div>
    </header>
  );
}
