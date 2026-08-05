#!/usr/bin/env node
/**
 * Scrape tire-repair shops (tambal ban) for Indonesia from OpenStreetMap via
 * the Overpass API, then import them into the shared `tambal_ban` table.
 *
 * Usage:
 *   node scripts/scrape-osm-workshops.mjs            # dry-run: fetch + preview
 *   node scripts/scrape-osm-workshops.mjs --apply    # dry-run first, then insert
 *   node scripts/scrape-osm-workshops.mjs --limit 20 --apply
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * if present (same file the app uses). Importing into `tambal_ban` is an admin
 * action, so the service_role key is required for --apply.
 *
 * Imported rows get source='osm', verified=true (matching the 131 rows already
 * in the table) and are visible on the public map immediately. OSM data comes
 * from community mapping and is treated as pre-verified — user submissions, by
 * contrast, land as source='user', verified=false until an admin flips them.
 *
 * Data source: © OpenStreetMap contributors (ODbL). This script makes no claim
 * of completeness — most tambal ban shops in Indonesia are NOT in OSM. Treat
 * this as a starter dataset; community submissions stay the primary source.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];
const USER_AGENT = "TambalBan-Import/0.1 (https://github.com/antsf/tambalban-web)";
const BATCH = 50;

// ---------------------------------------------------------------- env loading
function loadEnv() {
  const path = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// ------------------------------------------------------------- overpass query
const OVERPASS_QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="ID"][admin_level=2];
(
  nwr["shop"="tyres"](area);
  nwr["service:vehicle:tyres_repair"="yes"](area);
  nwr["shop"="car_repair"]["service:vehicle:tyres_repair"="yes"](area);
);
out tags center;`;

async function fetchOverpass() {
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "text/plain", "user-agent": USER_AGENT },
        body: OVERPASS_QUERY,
        signal: AbortSignal.timeout(330_000),
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status} (${endpoint})`);
      const data = await res.json();
      if (!Array.isArray(data.elements)) throw new Error("Overpass response tidak punya elements");
      return data.elements;
    } catch (err) {
      lastErr = err;
      console.log(`   ${endpoint} gagal (${err.message}), coba endpoint lain...`);
    }
  }
  throw lastErr ?? new Error("Semua endpoint Overpass gagal");
}

// --------------------------------------------------------------- tag mapping
const toBool = (v) => v === "yes" || v === "1" || v === "true";

function mapRow(el) {
  const t = el.tags ?? {};
  const center = el.center ?? {};

  const name = t.name || t["name:id"];
  if (!name) return null; // `name` is NOT NULL in the schema — skip unnamed points

  const lat = el.type === "node" ? el.lat : center.lat;
  const lon = el.type === "node" ? el.lon : center.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const street = t["addr:street"];
  const number = t["addr:housenumber"];
  const address = [number, street].filter(Boolean).join(" ").trim() || null;

  const whatsapp = t["contact:whatsapp"] || t["phone:whatsapp"] || t.whatsapp || null;
  const openingHours = t.opening_hours || null;

  return {
    name,
    lat,
    lon,
    phone: t.phone || t["contact:phone"] || null,
    whatsapp,
    address,
    city: t["addr:city"] || null,
    district: t["addr:district"] || t["addr:subdistrict"] || null,
    province: t["addr:province"] || null,
    opening_hours: openingHours,
    motorcycle_tyres: toBool(t["motorcycle:tyres"]),
    car_tyres: toBool(t["car:tyres"]),
    truck_tyres: toBool(t["truck:tyres"]),
    tubeless_repair: false,
    vulcanizer: false,
    balancing: false,
    spooring: false,
    roadside_service: false,
    source: "osm",
    verified: true,
    verified_at: new Date().toISOString(),
    osm_id: el.type === "node" ? Number(el.id) : null,
    osm_tags: t,
  };
}

// -------------------------------------------------------------------- dedup
// The 131 existing rows have no osm_id (imported before that column existed),
// so dedup must also match on name + rounded coords.
function dedupes(rows, existing) {
  const osmIds = existing.osmIds;
  const pairs = existing.pairs;
  return rows.filter((r) => {
    if (r.osm_id !== null && osmIds.has(r.osm_id)) return false;
    const key = `${r.name.toLowerCase()}|${r.lat.toFixed(4)}|${r.lon.toFixed(4)}`;
    return !pairs.has(key);
  });
}

async function fetchExisting(env, supabaseUrl) {
  // Migration 002 adds osm_id; older DBs lack it, so fall back to name+coords.
  let res = await fetch(
    `${supabaseUrl}/rest/v1/tambal_ban?select=name,lat,lon,osm_id&limit=1000`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    },
  );
  if (res.status === 400) {
    res = await fetch(
      `${supabaseUrl}/rest/v1/tambal_ban?select=name,lat,lon&limit=1000`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );
  }
  if (!res.ok) throw new Error(`Supabase GET HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const osmIds = new Set(data.filter((w) => w.osm_id != null).map((w) => Number(w.osm_id)));
  const pairs = new Set(
    data.map((w) => `${w.name.toLowerCase()}|${w.lat.toFixed(4)}|${w.lon.toFixed(4)}`),
  );
  return { osmIds, pairs };
}

async function insert(env, supabaseUrl, rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(`${supabaseUrl}/rest/v1/tambal_ban`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Supabase INSERT HTTP ${res.status}: ${await res.text()}`);
    inserted += chunk.length;
    console.log(`  inserted ${inserted}/${rows.length}`);
  }
  return inserted;
}

// ------------------------------------------------------------------------ main
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limit = Number(
  (process.argv.find((a) => a.startsWith("--limit=")) ?? "").split("=")[1] ?? "0",
);

console.log("1. Querying Overpass for Indonesian tyre-repair shops...");
const elements = await fetchOverpass();
console.log(`   got ${elements.length} raw elements`);

const rows = elements.map(mapRow).filter(Boolean);
console.log(`2. Mapped to ${rows.length} workshops (${elements.length - rows.length} skipped: no name / no coords)`);

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
let finalRows = rows;
if (supabaseUrl && env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("3. Loading existing rows from Supabase for dedup...");
  const existing = await fetchExisting(env, supabaseUrl);
  finalRows = dedupes(rows, existing);
  console.log(`   ${finalRows.length} new (${rows.length - finalRows.length} already imported)`);
} else {
  console.log("3. SKIPPING dedup — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan.");
}

if (limit > 0) finalRows = finalRows.slice(0, limit);

console.log(`4. ${apply ? "Applying" : "Dry-run —"} ${finalRows.length} rows to insert. Preview:`);
for (const r of finalRows.slice(0, 5)) {
  console.log(
    `   [osm ${r.osm_id}] ${r.name} @ ${r.lat.toFixed(4)},${r.lon.toFixed(4)} — ${r.phone ?? r.whatsapp ?? "no contact"}`,
  );
}

if (apply) {
  if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("--apply butuh NEXT_PUBLIC_SUPABASE_URL (atau SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY di .env.local");
  }
  const n = await insert(env, supabaseUrl, finalRows);
  console.log(`5. Done — ${n} workshops imported into tambal_ban (source='osm', verified=true).`);
  console.log('   Attribution: data © OpenStreetMap contributors (ODbL).');
} else {
  console.log("5. Nothing written. Re-run with --apply to insert.");
}
