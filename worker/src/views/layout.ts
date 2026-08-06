export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface LayoutOptions {
  title: string;
  active: string;
  admin?: boolean;
  bodyClass?: string;
  scripts?: string[];
  inlineScripts?: string[];
  noContainer?: boolean;
}

export function layout(opts: LayoutOptions, body: string): string {
  const { title, active, admin = false, bodyClass = "", scripts = [], inlineScripts = [], noContainer = false } = opts;
  const cdn = (src: string) => `<script src="${src}"></script>`;
  const inline = (code: string) => `<script>${code}</script>`;
  const header = `
    <header class="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="/" class="flex items-center gap-2 font-semibold text-slate-900">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">🛞</span>
          TambalBan
        </a>
        <nav class="flex items-center gap-1 text-sm font-medium text-slate-600">
          <a href="/" class="rounded-lg px-3 py-1.5 ${active === "home" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Peta</a>
          <a href="/submit" class="rounded-lg px-3 py-1.5 ${active === "submit" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Tambah</a>
          ${admin
            ? `<a href="/admin" class="rounded-lg px-3 py-1.5 ${active === "admin" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Antrian</a>
               <a href="/admin/data" class="rounded-lg px-3 py-1.5 ${active === "data" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Data</a>
               <a href="/admin/users" class="rounded-lg px-3 py-1.5 ${active === "users" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Pengguna</a>
               <a href="/admin/reviews" class="rounded-lg px-3 py-1.5 ${active === "reviews" ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"}">Ulasan</a>
               <a href="/api/admin/logout" class="rounded-lg px-3 py-1.5 hover:bg-slate-100">Keluar</a>`
            : `<a href="/login" class="rounded-lg px-3 py-1.5 hover:bg-slate-100">Masuk</a>`}
        </nav>
      </div>
    </header>`;

  const main = noContainer ? body : `<main class="mx-auto max-w-6xl px-4 py-6">${body}</main>`;
  const footer = `
    <footer class="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-400">
      Data: OpenStreetMap © kontributor (ODbL) & pengguna. Selalu verifikasi sebelum percaya.
    </footer>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} · TambalBan</title>
  <link rel="stylesheet" href="/tailwind.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  ${cdn("https://unpkg.com/htmx.org@2.0.4")}
  ${cdn("https://unpkg.com/htmx.org@2.0.4/dist/ext/json-enc.js")}
  ${cdn("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js")}
</head>
<body class="bg-slate-50 text-slate-900 ${bodyClass}">
  ${header}
  <div id="toast" class="fixed left-1/2 top-20 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-2"></div>
  ${main}
  ${footer}
  ${scripts.map(cdn).join("\n")}
  ${inlineScripts.map(inline).join("\n")}
</body>
</html>`;
}

export function errorToast(message: string): string {
  return `<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">${esc(message)}</div>`;
}

export function successToast(message: string): string {
  return `<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">${esc(message)}</div>`;
}

export function field(
  id: string,
  label: string,
  value: string,
  opts: { type?: string; placeholder?: string; required?: boolean; hint?: string } = {},
): string {
  const { type = "text", placeholder = "", required = false, hint } = opts;
  return `<div>
    <label for="${id}" class="mb-1 block text-sm font-medium text-slate-700">${esc(label)}</label>
    <input id="${id}" name="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"
      ${required ? "required" : ""}
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
    ${hint ? `<p class="mt-1 text-xs text-slate-400">${esc(hint)}</p>` : ""}
  </div>`;
}

export function checkbox(
  id: string,
  label: string,
  checked: boolean,
): string {
  return `<label class="flex items-center gap-2 text-sm text-slate-700">
    <input id="${id}" name="${id}" type="checkbox" value="true" ${checked ? "checked" : ""}
      class="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-100" />
    ${esc(label)}
  </label>`;
}
