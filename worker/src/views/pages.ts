import { esc, layout, errorToast, field, checkbox } from "./layout";
import type { Workshop, UnverifiedSubmission, AdminUser, Review } from "../lib/supabase";

const SERVICE_LABELS: Array<[keyof Pick<Workshop, "motorcycle_tyres" | "car_tyres" | "truck_tyres" | "tubeless_repair" | "vulcanizer" | "balancing" | "spooring" | "roadside_service">, string]> = [
  ["motorcycle_tyres", "Ban motor"],
  ["car_tyres", "Ban mobil"],
  ["truck_tyres", "Ban truk"],
  ["tubeless_repair", "Tambal tubeless"],
  ["vulcanizer", "Vulkanisir"],
  ["balancing", "Balancing"],
  ["spooring", "Spooring"],
  ["roadside_service", "Servis panggilan"],
];

const MAP_JS = `
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function popup(w){
  const lines=[w.name];
  if(w.address||w.city) lines.push(esc(w.address||'')+esc(w.city?', '+w.city:''));
  if(w.whatsapp) lines.push('<a href="https://wa.me/'+esc(w.whatsapp.replace(/[^0-9]/g,''))+'">WhatsApp: '+esc(w.whatsapp)+'</a>');
  else if(w.phone) lines.push('Telp: '+esc(w.phone));
  return lines.join('<br>');
}
const map=L.map('map').setView([-2.5,118],5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
const layer=L.layerGroup().addTo(map);
let deb;
async function load(){
  const b=map.getBounds();
  const p=new URLSearchParams({minLat:b.getSouth().toFixed(4),maxLat:b.getNorth().toFixed(4),minLng:b.getWest().toFixed(4),maxLng:b.getEast().toFixed(4)});
  const q=document.getElementById('q')?.value;
  if(q) p.set('search',q);
  try{
    const rows=await (await fetch('/api/workshops?'+p)).json();
    layer.clearLayers();
    for(const w of rows) L.marker([w.lat,w.lon]).addTo(layer).bindPopup(popup(w));
    document.getElementById('count').textContent=rows.length+' tampil';
  }catch(e){}
}
function requestLoad(){clearTimeout(deb);deb=setTimeout(load,350);}
map.on('moveend',requestLoad);
document.addEventListener('DOMContentLoaded',load);
`;

const SUBMIT_MAP_JS = `
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const map=L.map('pick').setView([-6.2,106.8],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
let marker;
map.on('click',function(e){
  if(marker) map.removeLayer(marker);
  marker=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);
  document.getElementById('lat').value=e.latlng.lat.toFixed(6);
  document.getElementById('lon').value=e.latlng.lng.toFixed(6);
  document.getElementById('pick-note').textContent='Titik dipilih: '+e.latlng.lat.toFixed(5)+', '+e.latlng.lng.toFixed(5);
});
async function geocode(){
  const q=document.getElementById('addr').value.trim();
  if(q.length<3) return;
  const p=new URLSearchParams({q});
  document.getElementById('geocode-msg').textContent='Mencari…';
  try{
    const rows=await (await fetch('/api/geocode?'+p)).json();
    if(!rows.length){document.getElementById('geocode-msg').textContent='Tidak ditemukan.';return;}
    const r=rows[0];
    if(marker) map.removeLayer(marker);
    marker=L.marker([r.lat,r.lon]).addTo(map);
    map.setView([r.lat,r.lon],16);
    document.getElementById('lat').value=r.lat;
    document.getElementById('lon').value=r.lon;
    document.getElementById('pick-note').textContent='Titik dipilih: '+r.lat+', '+r.lon+' — '+esc(r.display_name||'');
    if(!document.getElementById('address').value) document.getElementById('address').value=r.display_name||'';
  }catch(e){document.getElementById('geocode-msg').textContent='Gagal mencari.';}
}
document.addEventListener('DOMContentLoaded',function(){loadCached();});
function loadCached(){
  const lat=document.getElementById('lat').value, lon=document.getElementById('lon').value;
  if(lat&&lon&&!marker){marker=L.marker([lat,lon]).addTo(map);map.setView([lat,lon],15);}
}
`;

export function homePage(): string {
  const body = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-lg font-semibold text-slate-900">Peta bengkel tambal ban</h1>
        <span id="count" class="text-sm text-slate-400">memuat…</span>
        <input id="q" type="search" placeholder="Cari nama / kota…" oninput="requestLoad()"
          class="ml-auto w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64 focus:border-emerald-500 focus:outline-none" />
      </div>
      <div id="map" class="h-[70vh] w-full overflow-hidden rounded-xl border border-slate-200"></div>
      <p class="text-xs text-slate-400">Lokasi bengkel yang terverifikasi. Lihat langsung lokasi di peta saat pan/zoom.</p>
    </div>`;
  return layout({ title: "Peta", active: "home", inlineScripts: [MAP_JS], bodyClass: "flex min-h-screen flex-col", noContainer: false }, body);
}

export function loginPage(error?: string): string {
  const err = error ? errorToast(error) : "";
  const body = `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-1 text-xl font-semibold">Masuk</h1>
      <p class="mb-6 text-sm text-slate-500">Akun yang sama berlaku di aplikasi Android maupun web.</p>
      ${err}
      <form hx-post="/api/auth/login" hx-ext="json-enc" hx-target="#toast" hx-swap="innerHTML" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        ${field("email", "Email", "", { type: "email", placeholder: "nama@email.com", required: true })}
        ${field("password", "Password", "", { type: "password", required: true })}
        <button class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Masuk</button>
      </form>
      <p class="mt-4 text-center text-sm text-slate-500">Belum punya akun?
        <a href="/register" class="font-medium text-emerald-600 hover:underline">Daftar</a></p>
    </div>`;
  return layout({ title: "Masuk", active: "", bodyClass: "flex min-h-screen flex-col" }, body);
}

export function registerPage(error?: string): string {
  const err = error ? errorToast(error) : "";
  const body = `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-1 text-xl font-semibold">Daftar akun</h1>
      <p class="mb-6 text-sm text-slate-500">Dipakai untuk melacak siapa yang menambah data.</p>
      ${err}
      <form hx-post="/api/auth/register" hx-ext="json-enc" hx-target="#toast" hx-swap="innerHTML" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        ${field("email", "Email", "", { type: "email", placeholder: "nama@email.com", required: true })}
        ${field("password", "Password", "", { type: "password", required: true, hint: "Minimal 8 karakter." })}
        <button class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Daftar</button>
      </form>
      <p class="mt-4 text-center text-sm text-slate-500">Sudah punya akun?
        <a href="/login" class="font-medium text-emerald-600 hover:underline">Masuk</a></p>
    </div>`;
  return layout({ title: "Daftar", active: "", bodyClass: "flex min-h-screen flex-col" }, body);
}

export function submitPage(loggedInEmail: string | null, error?: string): string {
  if (!loggedInEmail) {
    const body = `
      <div class="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center">
        <h1 class="mb-2 text-xl font-semibold">Masuk dulu untuk menambah</h1>
        <p class="mb-6 text-sm text-slate-500">Setiap tambahan tercatat atas nama akunmu.</p>
        <a href="/login" class="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Masuk</a>
        <p class="mt-3 text-sm text-slate-500">Belum punya akun? <a href="/register" class="font-medium text-emerald-600 hover:underline">Daftar</a></p>
      </div>`;
    return layout({ title: "Tambah bengkel", active: "submit", bodyClass: "flex min-h-screen flex-col" }, body);
  }
  const err = error ? errorToast(error) : "";
  const services = SERVICE_LABELS.map(([k, label]) => checkbox(k, label, false)).join("");
  const body = `
    <div class="mx-auto max-w-2xl">
      <h1 class="mb-1 text-xl font-semibold">Tambah bengkel</h1>
      <p class="mb-6 text-sm text-slate-500">Masuk sebagai <span class="font-medium text-slate-700">${esc(loggedInEmail)}</span>. Kiriman jadi <b>terverifikasi</b> setelah ditinjau admin.</p>
      ${err}
      <div class="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">1. Titik lokasi di peta</label>
          <div id="pick" class="h-64 w-full overflow-hidden rounded-lg border border-slate-300"></div>
          <p id="pick-note" class="mt-1 text-xs text-slate-400">Klik peta untuk menandai lokasi, atau cari alamat di bawah.</p>
        </div>
        <div>
          <label for="addr" class="mb-1 block text-sm font-medium text-slate-700">2. Cari alamat</label>
          <div class="flex gap-2">
            <input id="addr" type="text" placeholder="Alamat / nama jalan / kota…"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            <button type="button" onclick="geocode()" class="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Cari</button>
          </div>
          <p id="geocode-msg" class="mt-1 text-xs text-slate-400"></p>
        </div>
        <form hx-post="/api/submissions" hx-ext="json-enc" hx-target="#toast" hx-swap="innerHTML" class="space-y-4">
          <input type="hidden" id="lat" name="lat" required />
          <input type="hidden" id="lon" name="lon" required />
          ${field("name", "Nama bengkel", "", { placeholder: "Tambah Ban Jaya", required: true })}
          ${field("address", "Alamat", "", { placeholder: "Jl. Contoh No. 1" })}
          <div class="grid gap-4 sm:grid-cols-2">
            ${field("city", "Kota / Kabupaten", "")}
            ${field("province", "Provinsi", "")}
            ${field("district", "Kecamatan", "")}
            ${field("phone", "No. telepon", "")}
            ${field("whatsapp", "WhatsApp", "", { hint: "Format 08xx (tanpa spasi)." })}
            ${field("opening_hours", "Jam buka", "", { placeholder: "07:00–21:00 / 24 jam" })}
          </div>
          <div>
            <p class="mb-2 text-sm font-medium text-slate-700">Layanan tersedia</p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">${services}</div>
          </div>
          <button class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Kirim untuk ditinjau</button>
        </form>
      </div>
    </div>`;
  return layout({ title: "Tambah bengkel", active: "submit", bodyClass: "flex min-h-screen flex-col", inlineScripts: [SUBMIT_MAP_JS] }, body);
}

export function adminLoginPage(error?: string): string {
  const err = error ? errorToast(error) : "";
  const body = `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-1 text-xl font-semibold">Login admin</h1>
      <p class="mb-6 text-sm text-slate-500">Hanya untuk peninjau data.</p>
      ${err}
      <form hx-post="/api/admin/login" hx-ext="json-enc" hx-target="#toast" hx-swap="innerHTML" class="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        ${field("password", "Password", "", { type: "password", required: true })}
        <button class="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Masuk</button>
      </form>
    </div>`;
  return layout({ title: "Login admin", active: "", admin: true, bodyClass: "flex min-h-screen flex-col" }, body);
}

function submissionCard(row: UnverifiedSubmission, index: number): string {
  const link = row.lat != null && row.lon != null
    ? `<a class="text-emerald-600 hover:underline" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lon}#map=17/${row.lat}/${row.lon}">Lihat di peta</a>`
    : "";
  const meta = [
    row.city ? esc(row.city) : "",
    row.province ? esc(row.province) : "",
    row.phone ? `Telp: ${esc(row.phone)}` : "",
    row.whatsapp ? `WA: ${esc(row.whatsapp)}` : "",
    row.opening_hours ? `Jam: ${esc(row.opening_hours)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<li class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 class="font-semibold text-slate-900">${esc(row.name)}</h3>
        ${meta ? `<p class="mt-1 text-sm text-slate-500">${meta}</p>` : ""}
        ${row.address ? `<p class="mt-1 text-sm text-slate-500">${esc(row.address)}</p>` : ""}
        <p class="mt-1 text-xs text-slate-400">Dikirim ${esc(row.created_at)}${row.user_id ? ` · user ${esc(row.user_id.slice(0, 8))}` : ""}</p>
      </div>
      <div class="flex gap-2">
        ${link}
        <button hx-post="/api/admin/submissions/${row.id}/publish" hx-target="closest li" hx-swap="outerHTML"
          class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Terbitkan</button>
        <button hx-post="/api/admin/submissions/${row.id}/remove" hx-target="closest li" hx-swap="outerHTML" hx-confirm="Hapus ${esc(row.name)}?"
          class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Hapus</button>
      </div>
    </div>
  </li>`;
}

export function adminQueueRow(row: UnverifiedSubmission, index: number): string {
  return submissionCard(row, index);
}

export function adminQueueEmpty(): string {
  return `<li class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Tidak ada kiriman menunggu. Semua sudah diterbitkan.</li>`;
}

export function adminQueuePage(rows: UnverifiedSubmission[]): string {
  const list = rows.length ? rows.map(submissionCard).join("") : adminQueueEmpty();
  const body = `
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold text-slate-900">Antrian kiriman (${rows.length})</h1>
      <a href="/admin" class="text-sm text-emerald-600 hover:underline">Muat ulang</a>
    </div>
    <ul id="queue" class="mt-4 space-y-3">${list}</ul>
    <p class="mt-6 text-xs text-slate-400">Menerbitkan menandai verified=true dan menguncinya. Menghapus menghapus baris dari database.</p>`;
  return layout({ title: "Antrian admin", active: "admin", admin: true, bodyClass: "flex min-h-screen flex-col" }, body);
}

export interface AdminDataQuery {
  search?: string;
  verified?: string;
  source?: string;
  limit?: number;
}

function badge(text: string, cls: string): string {
  return `<span class="rounded-full px-2 py-0.5 text-xs font-medium ${cls}">${esc(text)}</span>`;
}

function adminDataRow(row: Workshop): string {
  const services = SERVICE_LABELS.filter(([k]) => row[k]).map(([, label]) => label);
  const svc = services.length
    ? `<p class="mt-1 text-xs text-slate-400">${services.map((s) => badge(s, "bg-slate-100 text-slate-600")).join(" ")}</p>`
    : "";
  const link = row.lat != null && row.lon != null
    ? `<a class="text-emerald-600 hover:underline" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lon}#map=17/${row.lat}/${row.lon}">Lihat di peta</a>`
    : "";
  const meta = [
    row.city ? esc(row.city) : "",
    row.province ? esc(row.province) : "",
    row.phone ? `Telp: ${esc(row.phone)}` : "",
    row.opening_hours ? `Jam: ${esc(row.opening_hours)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<li class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="font-semibold text-slate-900">${esc(row.name)}</h3>
          ${row.source === "osm" ? badge("OSM", "bg-sky-100 text-sky-700") : badge("pengguna", "bg-violet-100 text-violet-700")}
          ${row.verified ? badge("terverifikasi", "bg-emerald-100 text-emerald-700") : badge("belum", "bg-amber-100 text-amber-700")}
        </div>
        ${meta ? `<p class="mt-1 text-sm text-slate-500">${meta}</p>` : ""}
        ${row.address ? `<p class="mt-1 text-sm text-slate-500">${esc(row.address)}</p>` : ""}
        ${svc}
        <p class="mt-1 text-xs text-slate-400">Dibuat ${esc(row.created_at)}${row.verified_at ? ` · diterbitkan ${esc(row.verified_at)}` : ""}</p>
      </div>
      <div class="flex gap-2">
        ${link}
        ${row.verified
          ? ""
          : `<button hx-post="/api/admin/submissions/${row.id}/publish" hx-target="closest li" hx-swap="outerHTML"
              class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Terbitkan</button>`}
        <button hx-post="/api/admin/submissions/${row.id}/remove" hx-target="closest li" hx-swap="outerHTML" hx-confirm="Hapus ${esc(row.name)}?"
          class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Hapus</button>
      </div>
    </div>
  </li>`;
}

export function adminDataList(rows: Workshop[]): string {
  if (!rows.length) {
    return `<li class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Tidak ada data yang cocok.</li>`;
  }
  return rows.map(adminDataRow).join("");
}

export function adminAllDataPage(rows: Workshop[], query: AdminDataQuery): string {
  const sel = (name: string, value: string | undefined, options: Array<[string, string]>) =>
    `<select name="${name}" hx-get="/api/admin/workshops" hx-target="#data-list" hx-swap="innerHTML" hx-trigger="change"
        hx-include="closest form" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none">
      <option value="">${esc(options[0][1])}</option>
      ${options
        .slice(1)
        .map(([v, label]) => `<option value="${v}" ${value === v ? "selected" : ""}>${esc(label)}</option>`)
        .join("")}
    </select>`;
  const body = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-lg font-semibold text-slate-900">Semua data (${rows.length} baris termuat)</h1>
        <a href="/admin/data" class="text-sm text-emerald-600 hover:underline">Muat ulang</a>
      </div>
      <form hx-get="/api/admin/workshops" hx-target="#data-list" hx-swap="innerHTML" class="flex flex-wrap items-center gap-2">
        <input name="search" type="search" value="${esc(query.search ?? "")}" placeholder="Cari nama / alamat / kota…"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none sm:w-64" />
        ${sel("verified", query.verified, [["", "Semua status"], ["false", "Belum terverifikasi"], ["true", "Terverifikasi"]])}
        ${sel("source", query.source, [["", "Semua sumber"], ["user", "Pengguna"], ["osm", "OSM"]])}
        <button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Terapkan</button>
      </form>
      <ul id="data-list" class="space-y-3">${adminDataList(rows)}</ul>
      <p class="text-xs text-slate-400">Menampilkan hingga 100 baris terbaru. Terbitkan menandai verified=true; Hapus menghapus baris dari database.</p>
    </div>`;
  return layout({ title: "Data admin", active: "data", admin: true, bodyClass: "flex min-h-screen flex-col" }, body);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function adminUsersPage(users: AdminUser[], total: number, query: { search?: string }): string {
  const rows = users.length
    ? users
        .map(
          (u) => `<tr class="border-b border-slate-100 last:border-0">
    <td class="px-3 py-2 align-top">
      <div class="font-medium text-slate-900">${esc(u.email ?? "—")}</div>
      <div class="text-xs text-slate-400">${esc(u.id)}</div>
    </td>
    <td class="px-3 py-2 align-top text-sm text-slate-600">${esc(u.phone ?? "—")}</td>
    <td class="px-3 py-2 align-top text-sm text-slate-600">${fmtDate(u.created_at)}</td>
    <td class="px-3 py-2 align-top text-sm text-slate-600">${u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : "—"}</td>
  </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="px-3 py-8 text-center text-sm text-slate-500">Tidak ada pengguna yang cocok.</td></tr>`;
  const body = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-lg font-semibold text-slate-900">Pengguna (${total})</h1>
        <a href="/admin/users" class="text-sm text-emerald-600 hover:underline">Muat ulang</a>
      </div>
      <form method="get" action="/admin/users" class="flex flex-wrap items-center gap-2">
        <input name="search" type="search" value="${esc(query.search ?? "")}" placeholder="Cari email / telepon…"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none sm:w-64" />
        <button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Cari</button>
      </form>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th class="px-3 py-2">Email</th>
              <th class="px-3 py-2">Telepon</th>
              <th class="px-3 py-2">Dibuat</th>
              <th class="px-3 py-2">Masuk terakhir</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${total > users.length ? `<p class="text-xs text-slate-400">Menampilkan ${users.length} dari ${total} pengguna.</p>` : ""}
    </div>`;
  return layout({ title: "Pengguna", active: "users", admin: true, bodyClass: "flex min-h-screen flex-col" }, body);
}

export function adminReviewsPage(
  reviews: Review[],
  emails: Map<string, string>,
  query: { rating?: number },
): string {
  const ratingOptions = [1, 2, 3, 4, 5]
    .map(
      (r) =>
        `<option value="${r}" ${query.rating === r ? "selected" : ""}>${r} bintang${r > 1 ? "s" : ""}</option>`,
    )
    .join("");
  const rows = reviews.length
    ? reviews
        .map((rv) => {
          const email = rv.user_id ? emails.get(rv.user_id) : undefined;
          const stars = "★".repeat(rv.rating) + "☆".repeat(5 - rv.rating);
          return `<li class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-amber-500">${stars}</span>
          <span class="text-xs text-slate-400">${fmtDate(rv.created_at)}</span>
        </div>
        ${rv.comment ? `<p class="mt-1 text-sm text-slate-700">${esc(rv.comment)}</p>` : '<p class="mt-1 text-sm italic text-slate-400">Tanpa komentar</p>'}
        <p class="mt-2 text-xs text-slate-500">
          <span class="font-medium text-slate-700">${esc(rv.tambal_ban?.name ?? "Bengkel dihapus")}</span>
          · ${email ? esc(email) : rv.user_id ? "pengguna (email tak terdaftar)" : "pengguna dihapus"}
        </p>
      </div>
    </div>
  </li>`;
        })
        .join("")
    : `<li class="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada ulasan yang cocok.</li>`;
  const body = `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h1 class="text-lg font-semibold text-slate-900">Ulasan (${reviews.length} baris termuat)</h1>
        <a href="/admin/reviews" class="text-sm text-emerald-600 hover:underline">Muat ulang</a>
      </div>
      <form method="get" action="/admin/reviews" class="flex flex-wrap items-center gap-2">
        <select name="rating" onchange="this.form.submit()"
          class="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none">
          <option value="">Semua rating</option>
          ${ratingOptions}
        </select>
      </form>
      <ul class="space-y-3">${rows}</ul>
    </div>`;
  return layout({ title: "Ulasan", active: "reviews", admin: true, bodyClass: "flex min-h-screen flex-col" }, body);
}
