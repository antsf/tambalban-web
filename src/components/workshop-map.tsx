"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Bounds, Workshop } from "@/types";
import { formatHours, telHref } from "@/lib/format";

const INDONESIA_CENTER: [number, number] = [-2.5, 118.0];

/** Square pin with a hard shadow — Leaflet's default PNG icons are dropped. */
function pinIcon(is24h: boolean): L.DivIcon {
  const color = is24h ? "#00A651" : "#0057FF";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:20px;height:20px;background:${color};border:3px solid #111;box-shadow:3px 3px 0 0 #111"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

function ViewportWatcher({ onChange }: { onChange: (bounds: Bounds) => void }) {
  const map = useMapEvents({
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  function emit() {
    const b = map.getBounds();
    onChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }

  useEffect(() => {
    emit();
    // Only on mount — subsequent updates come from map events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

type Props = {
  center?: [number, number];
  zoom?: number;
};

export function WorkshopMap({ center = INDONESIA_CENTER, zoom = 5 }: Props) {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleBoundsChange(bounds: Bounds) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void load(bounds), 400);
  }

  async function load(bounds: Bounds) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        north: String(bounds.north),
        south: String(bounds.south),
        east: String(bounds.east),
        west: String(bounds.west),
      });
      const res = await fetch(`/api/workshops?${params}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat data");
      setWorkshops(json.workshops as Workshop[]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const markers = useMemo(
    () =>
      workshops.map((w) => (
        <Marker
          key={w.id}
          position={[w.latitude, w.longitude]}
          icon={pinIcon(w.is_24h)}
        >
          <Popup>
            <div className="min-w-52 space-y-1">
              <p className="text-base font-black uppercase leading-tight">
                {w.name}
              </p>
              {w.address && <p className="text-xs">{w.address}</p>}
              <p className="text-xs font-bold">{formatHours(w)}</p>
              {w.rating_count > 0 && (
                <p className="text-xs">
                  ★ {w.rating_avg.toFixed(1)} ({w.rating_count} ulasan)
                </p>
              )}
              {w.phone && (
                <a
                  href={telHref(w.phone)}
                  className="mt-2 inline-block border-3 border-ink bg-brand px-2 py-1 text-xs font-black uppercase"
                >
                  Telepon
                </a>
              )}
            </div>
          </Popup>
        </Marker>
      )),
    [workshops],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ViewportWatcher onChange={handleBoundsChange} />
        {markers}
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-1000 flex flex-col gap-2">
        <span className="card-brutal px-3 py-1.5 text-xs font-black uppercase">
          {loading ? "Memuat…" : `${workshops.length} tambal ban di layar`}
        </span>
        {error && (
          <span className="card-brutal bg-danger px-3 py-1.5 text-xs font-bold text-white">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
