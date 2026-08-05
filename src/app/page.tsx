import Link from "next/link";
import { MapPanel } from "@/components/map-panel";

export default function HomePage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-ink bg-white px-4 py-3">
        <div>
          <h1 className="text-xl font-black uppercase leading-tight sm:text-2xl">
            Peta Tambal Ban
          </h1>
          <p className="text-xs font-medium sm:text-sm">
            Data dari komunitas — geser peta untuk memuat lokasi di sekitar
          </p>
        </div>
        <Link
          href="/submit"
          className="btn-brutal bg-danger px-4 py-2 text-sm text-white"
        >
          + Tambah Tambal Ban
        </Link>
      </div>

      <div className="relative flex-1">
        <MapPanel />
      </div>
    </div>
  );
}
