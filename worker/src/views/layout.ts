import { SITE_URL } from "../lib/site";
import { esc } from "./escape";
import { navLink, navigationDrawer, notice } from "./components";
export { esc } from "./escape";
export { field, checkbox } from "./components";

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
  /** Raw HTML injected right before </head> — e.g. a page-scoped font <link>, so pages that
   * don't need it (most of the site) don't pay the extra request. */
  extraHead?: string;
}

const DEFAULT_DESCRIPTION =
  "Peta bengkel tambal ban terverifikasi di Indonesia. Cari tambalan ban terdekat dan kirim lokasi bengkel baru.";

export function layout(opts: LayoutOptions, body: string): string {
  const { title, active, admin = false, user, bodyClass = "", scripts = [], inlineScripts = [], noContainer = false, maps = false, description = DEFAULT_DESCRIPTION, canonical, jsonLd = [], extraHead = "" } = opts;
  const cdn = (src: string) => `<script src="${src}"></script>`;
  const inline = (code: string) => `<script>${code}</script>`;
  const pageUrl = canonical ?? `${SITE_URL}/`;
  const pageTitle = `${title} · TambalBan`;

  const link = (href: string, label: string, key: string) => navLink(href, label, active === key);

  const publicLinks = `${link("/", "Peta", "home")}${link("/submit", "Tambah bengkel", "submit")}`;

  let authLinks: string;
  if (admin) {
    authLinks =
      link("/admin", "Antrian", "admin") + link("/admin/data", "Data", "data") +
      link("/admin/users", "Pengguna", "users") + link("/admin/reviews", "Ulasan", "reviews") +
      navLink("/api/admin/logout", "Keluar", false, true);
  } else if (user) {
    authLinks = navLink("/api/auth/logout", "Keluar", false, true);
  } else {
    authLinks = link("/login", "Masuk", "login");
  }

  const header = `
    <header class="site-header">
      <div class="header-inner">
        <a href="/" class="wordmark" aria-label="TambalBan — peta bengkel">
          <img src="/icon.svg" width="34" height="34" alt="" />TambalBan
        </a>
        <nav id="nav-desktop" aria-label="Navigasi utama">
          ${publicLinks}${authLinks}
        </nav>
        <button id="nav-toggle" type="button" data-dialog-open="nav-mobile" aria-controls="nav-mobile" aria-expanded="false" aria-haspopup="dialog" aria-label="Buka menu navigasi"
          class="btn" data-variant="outline">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </header>${navigationDrawer(publicLinks + authLinks)}`;

  // HTMX restores the history element's innerHTML, not its attributes. Keep
  // the privacy opt-out inside that content so Back cannot drop the boundary.
  const privatePage = admin || user || ["login", "register"].includes(active);
  const main = `<main id="main" tabindex="-1"${privatePage ? ' hx-history="false"' : ""} class="${noContainer ? "" : "page-container"}">${body}</main>`;
  const footer = `
    <footer class="site-footer">
      <span>Data: OpenStreetMap © kontributor (ODbL) & pengguna.</span><span>Hubungi bengkel untuk memastikan layanan dan jam buka.</span>
    </footer>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${esc(description)}" />
  ${admin ? `<meta name="robots" content="noindex" />` : ""}
  ${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ""}
  <meta name="theme-color" content="#8A2BE2" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="TambalBan" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="${SITE_URL}/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="TambalBan — peta bengkel tambal ban terverifikasi di Indonesia" />
  <meta name="twitter:card" content="summary_large_image" />
  ${jsonLd.map((j) => `<script type="application/ld+json">${j}</script>`).join("\n")}
  <title>${esc(title)} · TambalBan</title>
  <style>@layer theme, base, legacy, components, utilities;</style>
  <link rel="stylesheet" href="/vendor/basecoat/1.0.2/basecoat.cdn.min.css" />
  <link rel="stylesheet" href="/tailwind.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
  ${maps ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />` : ""}
  ${cdn("https://unpkg.com/htmx.org@2.0.4")}
  ${cdn("https://unpkg.com/htmx.org@2.0.4/dist/ext/json-enc.js")}
  <script src="/vendor/basecoat/1.0.2/basecoat.min.js" defer></script>
  <script src="/vendor/basecoat/1.0.2/drawer.min.js" defer></script>
  <script src="/ui.js" defer></script>
  ${maps ? `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` : ""}
  ${extraHead}
</head>
<body class="font-barlow bg-brand-surface text-brand-onSurface ${bodyClass}">
  <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-onSurface focus:shadow">
    Langsung ke konten utama
  </a>
  <div id="page-shell" hx-history-elt>
  ${header}
  <div id="toast" role="status" aria-live="polite" class="toast-region"></div>
  ${main}
  ${footer}
  </div>
  ${scripts.map(cdn).join("\n")}
  ${inlineScripts.map(inline).join("\n")}
</body>
</html>`;
}

export function errorToast(message: string): string {
  return notice(message, "error");
}

export function successToast(message: string): string {
  return notice(message, "success");
}
