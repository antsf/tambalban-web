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
  user?: string;
  bodyClass?: string;
  scripts?: string[];
  inlineScripts?: string[];
  noContainer?: boolean;
  /** Load Leaflet (CSS + JS) for pages that render a map (`/` and the logged-in `/submit`). Off otherwise. */
  maps?: boolean;
  /** Meta description; a sensible default is used when omitted. */
  description?: string;
  /** Canonical URL for this page (absolute); omitted = no canonical tag. */
  canonical?: string;
  /** Raw JSON-LD blocks injected in <head>. */
  jsonLd?: string[];
}

const DEFAULT_DESCRIPTION =
  "Peta bengkel tambal ban terverifikasi di Indonesia. Cari tambalan ban terdekat dan kirim lokasi bengkel baru.";

export function layout(opts: LayoutOptions, body: string): string {
  const { title, active, admin = false, user, bodyClass = "", scripts = [], inlineScripts = [], noContainer = false, maps = false, description = DEFAULT_DESCRIPTION, canonical, jsonLd = [] } = opts;
  const cdn = (src: string) => `<script src="${src}"></script>`;
  const inline = (code: string) => `<script>${code}</script>`;
  const pageUrl = canonical ?? "https://tambalban.org/";
  const pageTitle = `${title} · TambalBan`;

  const navLink = (href: string, label: string, key: string, extraClass = "") =>
    `<a href="${href}" class="rounded-lg px-3 py-1.5 ${active === key ? "bg-emerald-50 text-emerald-700" : "hover:bg-slate-100"} ${extraClass}">${label}</a>`;

  const publicLinks = `${navLink("/", "Peta", "home")}${navLink("/submit", "Tambah", "submit")}`;

  let authLinks: string;
  if (admin) {
    authLinks =
      `<span class="hidden sm:inline sm:w-px sm:self-stretch sm:bg-slate-200"></span>` +
      navLink("/admin", "Antrian", "admin") +
      navLink("/admin/data", "Data", "data") +
      navLink("/admin/users", "Pengguna", "users") +
      navLink("/admin/reviews", "Ulasan", "reviews") +
      `<a href="/api/admin/logout" class="rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50">Keluar</a>`;
  } else if (user) {
    authLinks = `<a href="/api/auth/logout" class="rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50">Keluar</a>`;
  } else {
    authLinks = navLink("/login", "Masuk", "login");
  }

  const header = `
    <header class="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <a href="/" class="flex items-center gap-2 font-semibold text-slate-900">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">🛞</span>
          TambalBan
        </a>
        <nav id="nav-desktop" class="hidden items-center gap-1 text-sm font-medium text-slate-600 sm:flex">
          ${publicLinks}${authLinks}
        </nav>
        <button id="nav-toggle" type="button" onclick="document.getElementById('nav-mobile').classList.toggle('hidden')" aria-label="Buka menu navigasi"
          class="sm:hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
      <nav id="nav-mobile" class="hidden border-t border-slate-200 bg-white px-4 py-2 sm:hidden">
        <div class="flex flex-col gap-1 text-sm font-medium text-slate-600">
          ${publicLinks}${authLinks}
        </div>
      </nav>
    </header>`;

const main = noContainer ? body : `<main id="main" class="mx-auto max-w-6xl px-4 py-6">${body}</main>`;
  const footer = `
    <footer class="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-500">
      Data: OpenStreetMap © kontributor (ODbL) & pengguna. Selalu verifikasi sebelum percaya.
    </footer>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${esc(description)}" />
  ${admin ? `<meta name="robots" content="noindex" />` : ""}
  ${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ""}
  <meta name="theme-color" content="#059669" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="TambalBan" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="https://tambalban.org/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="TambalBan — peta bengkel tambal ban terverifikasi di Indonesia" />
  <meta name="twitter:card" content="summary_large_image" />
  ${jsonLd.map((j) => `<script type="application/ld+json">${j}</script>`).join("\n")}
  <title>${esc(title)} · TambalBan</title>
  <link rel="stylesheet" href="/tailwind.css" />
  ${maps ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />` : ""}
  ${cdn("https://unpkg.com/htmx.org@2.0.4")}
  ${cdn("https://unpkg.com/htmx.org@2.0.4/dist/ext/json-enc.js")}
  ${maps ? `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` : ""}
</head>
<body class="bg-slate-50 text-slate-900 ${bodyClass}">
  <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow">
    Langsung ke konten utama
  </a>
  ${header}
  <div id="toast" role="status" aria-live="polite" class="fixed left-1/2 top-20 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-2"></div>
  ${main}
  ${footer}
  ${scripts.map(cdn).join("\n")}
  ${inlineScripts.map(inline).join("\n")}
</body>
</html>`;
}

export function errorToast(message: string): string {
  return `<div role="alert" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">${esc(message)}</div>`;
}

export function successToast(message: string): string {
  return `<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">${esc(message)}</div>`;
}

export function field(
  id: string,
  label: string,
  value: string,
  opts: { type?: string; placeholder?: string; required?: boolean; hint?: string; autocomplete?: string } = {},
): string {
  const { type = "text", placeholder = "", required = false, hint, autocomplete } = opts;
  return `<div>
    <label for="${id}" class="mb-1 block text-sm font-medium text-slate-700">${esc(label)}</label>
    <input id="${id}" name="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"
      ${required ? "required" : ""}
      ${autocomplete ? `autocomplete="${autocomplete}"` : ""}
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
    ${hint ? `<p class="mt-1 text-xs text-slate-500">${esc(hint)}</p>` : ""}
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
