"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` at import time, so it must never be prerendered. */
const WorkshopMap = dynamic(
  () => import("./workshop-map").then((m) => m.WorkshopMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#dcd6c8]">
        <span className="card-brutal px-4 py-2 text-sm font-black uppercase">
          Memuat peta…
        </span>
      </div>
    ),
  },
);

export function MapPanel() {
  return <WorkshopMap />;
}
