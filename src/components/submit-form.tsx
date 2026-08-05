"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { INDONESIA_BOUNDS } from "@/lib/validation";

const LocationPicker = dynamic(
  () => import("./location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#dcd6c8] text-sm font-black uppercase">
        Memuat peta…
      </div>
    ),
  },
);

const JAKARTA: [number, number] = [-6.2088, 106.8456];

type GeocodeResult = { label: string; latitude: number; longitude: number };

function inIndonesia(lat: number, lng: number): boolean {
  return (
    lat >= INDONESIA_BOUNDS.minLat &&
    lat <= INDONESIA_BOUNDS.maxLat &&
    lng >= INDONESIA_BOUNDS.minLng &&
    lng <= INDONESIA_BOUNDS.maxLng
  );
}

export function SubmitForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [is24h, setIs24h] = useState(false);
  const [openTime, setOpenTime] = useState("07:00");
  const [closeTime, setCloseTime] = useState("21:00");
  const [notes, setNotes] = useState("");

  const [lat, setLat] = useState(JAKARTA[0]);
  const [lng, setLng] = useState(JAKARTA[1]);
  const [addressTouched, setAddressTouched] = useState(false);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fill the address from the pin until the user edits it themselves.
  useEffect(() => {
    if (addressTouched) return;
    if (reverseTimer.current) clearTimeout(reverseTimer.current);

    reverseTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
        const json = await res.json();
        if (res.ok && json.address) setAddress(json.address as string);
      } catch {
        // Geocoding is a convenience — the user can always type the address.
      }
    }, 700);

    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
    };
  }, [lat, lng, addressTouched]);

  function moveTo(nextLat: number, nextLng: number) {
    setLat(nextLat);
    setLng(nextLng);
  }

  async function searchPlace() {
    if (placeQuery.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(placeQuery)}`);
      const json = await res.json();
      setPlaceResults(res.ok ? (json.results as GeocodeResult[]) : []);
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Browser tidak mendukung geolocation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => moveTo(pos.coords.latitude, pos.coords.longitude),
      () => setError("Gagal ambil lokasi. Izinkan akses lokasi di browser."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!inIndonesia(lat, lng)) {
      setError("Titik lokasi di luar wilayah Indonesia");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          address,
          latitude: lat,
          longitude: lng,
          is_24h: is24h,
          open_time: is24h ? null : openTime,
          close_time: is24h ? null : closeTime,
          notes: notes.trim() ? notes : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal mengirim data");
      setDoneId(json.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim data");
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <div className="card-brutal bg-ok p-6 text-white">
        <h2 className="text-2xl font-black uppercase">Terkirim!</h2>
        <p className="mt-2 font-medium">
          Data tambal ban masuk antrean review. Setelah disetujui, lokasinya
          muncul di peta dan di aplikasi TambalBan.
        </p>
        <p className="mt-1 font-mono text-xs opacity-80">ID: {doneId}</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setDoneId(null);
              setName("");
              setPhone("");
              setNotes("");
              setAddressTouched(false);
            }}
            className="btn-brutal bg-white px-4 py-2 text-sm text-ink"
          >
            Tambah lagi
          </button>
          <Link href="/" className="btn-brutal bg-brand px-4 py-2 text-sm text-ink">
            Lihat peta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
      {/* Location column */}
      <section className="card-brutal p-4">
        <h2 className="mb-3 text-lg font-black uppercase">1. Titik lokasi</h2>

        <div className="flex gap-2">
          <input
            type="text"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void searchPlace();
              }
            }}
            placeholder="Cari daerah, jalan, atau kota"
            className="input-brutal"
          />
          <button
            type="button"
            onClick={() => void searchPlace()}
            disabled={searching}
            className="btn-brutal shrink-0 bg-brand px-3 py-2 text-sm"
          >
            {searching ? "…" : "Cari"}
          </button>
        </div>

        {placeResults.length > 0 && (
          <ul className="mt-2 max-h-36 overflow-y-auto border-3 border-ink">
            {placeResults.map((r) => (
              <li key={`${r.latitude},${r.longitude}`}>
                <button
                  type="button"
                  onClick={() => {
                    moveTo(r.latitude, r.longitude);
                    setPlaceResults([]);
                  }}
                  className="w-full border-b border-ink/20 px-3 py-2 text-left text-xs hover:bg-brand"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 h-72 border-3 border-ink">
          <LocationPicker latitude={lat} longitude={lng} onChange={moveTo} />
        </div>

        <p className="mt-2 text-xs font-bold uppercase">
          Geser pin atau klik peta untuk menandai lokasi
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-black uppercase">
            Latitude
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              className="input-brutal mt-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs font-black uppercase">
            Longitude
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              className="input-brutal mt-1 font-mono text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          className="btn-brutal mt-3 w-full bg-accent px-4 py-2 text-sm text-white"
        >
          Pakai lokasi saya
        </button>
      </section>

      {/* Detail column */}
      <section className="card-brutal p-4">
        <h2 className="mb-3 text-lg font-black uppercase">2. Data tambal ban</h2>

        <div className="space-y-3">
          <label className="block text-xs font-black uppercase">
            Nama tambal ban *
            <input
              type="text"
              required
              minLength={3}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tambal Ban Pak Budi"
              className="input-brutal mt-1 text-sm normal-case"
            />
          </label>

          <label className="block text-xs font-black uppercase">
            Nomor telepon / WA *
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0812xxxxxxx"
              className="input-brutal mt-1 text-sm"
            />
          </label>

          <label className="block text-xs font-black uppercase">
            Alamat *
            <textarea
              required
              minLength={10}
              maxLength={300}
              rows={3}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressTouched(true);
              }}
              placeholder="Jl. ... No. ..., Kecamatan, Kota"
              className="input-brutal mt-1 text-sm normal-case"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-black uppercase">
            <input
              type="checkbox"
              checked={is24h}
              onChange={(e) => setIs24h(e.target.checked)}
              className="h-5 w-5 border-3 border-ink accent-accent"
            />
            Buka 24 jam
          </label>

          {!is24h && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-black uppercase">
                Jam buka
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="input-brutal mt-1 text-sm"
                />
              </label>
              <label className="text-xs font-black uppercase">
                Jam tutup
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="input-brutal mt-1 text-sm"
                />
              </label>
            </div>
          )}

          <label className="block text-xs font-black uppercase">
            Catatan (opsional)
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Patokan, layanan tambal ban tubeless, dll"
              className="input-brutal mt-1 text-sm normal-case"
            />
          </label>
        </div>

        {error && (
          <p className="mt-4 border-3 border-ink bg-danger px-3 py-2 text-sm font-bold text-white">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-brutal mt-4 w-full bg-brand px-4 py-3 text-base"
        >
          {submitting ? "Mengirim…" : "Kirim data"}
        </button>

        <p className="mt-2 text-xs">
          Data masuk antrean review dulu sebelum tampil di peta.
        </p>
      </section>
    </form>
  );
}
