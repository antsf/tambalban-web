import { esc } from "./escape";

// Small typed string renderers, composed by Hono pages. `body` is authored HTML;
// user-facing text and attribute values always pass through esc, never a DSL.
export type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";
export function button(label: string, opts: { variant?: ButtonVariant; type?: "button" | "submit"; action?: string; id?: string; className?: string; hidden?: boolean } = {}): string {
  return `<button type="${opts.type ?? "button"}" class="btn ${esc(opts.className ?? "")}" data-variant="${opts.variant ?? "primary"}"${opts.action ? ` data-action="${esc(opts.action)}"` : ""}${opts.id ? ` id="${esc(opts.id)}"` : ""}${opts.hidden ? " hidden" : ""}>${esc(label)}</button>`;
}
export function card(body: string, className = "", id?: string): string {
  return `<section class="card ${esc(className)}"${id ? ` id="${esc(id)}" tabindex="-1"` : ""}>${body}</section>`;
}
export function pageHeading(title: string, description: string): string {
  return `<header class="page-heading"><h1>${esc(title)}</h1><p>${esc(description)}</p></header>`;
}
export function navLink(href: string, label: string, current: boolean, logout = false): string {
  return `<a href="${esc(href)}" class="nav-link"${current ? ' aria-current="page"' : ""}${logout ? ' hx-boost="false"' : ' hx-boost="true" hx-target="#page-shell" hx-select="#page-shell" hx-swap="outerHTML"'}>${esc(label)}</a>`;
}
export function field(id: string, label: string, value: string, opts: { type?: string; placeholder?: string; required?: boolean; hint?: string; autocomplete?: string } = {}): string {
  return `<div class="field"><label class="label" for="${esc(id)}">${esc(label)}</label>
    <input id="${esc(id)}" name="${esc(id)}" type="${esc(opts.type ?? "text")}" value="${esc(value)}" placeholder="${esc(opts.placeholder ?? "")}" class="input"${opts.required ? " required" : ""}${opts.autocomplete ? ` autocomplete="${esc(opts.autocomplete)}"` : ""}${opts.hint ? ` aria-describedby="${esc(id)}-hint"` : ""} />
    ${opts.hint ? `<p id="${esc(id)}-hint" class="field-hint">${esc(opts.hint)}</p>` : ""}</div>`;
}
export function checkbox(id: string, label: string, checked: boolean): string {
  return `<label class="service-option"><input id="${esc(id)}" name="${esc(id)}" type="checkbox" value="true" class="checkbox" ${checked ? "checked" : ""} />${esc(label)}</label>`;
}
export function notice(message: string, kind: "error" | "success"): string {
  return `<div class="alert notice-${kind}"${kind === "error" ? ' role="alert"' : ' role="status"'}><p>${esc(message)}</p></div>`;
}
export function navigationDrawer(links: string): string {
  return `<dialog id="nav-mobile" class="drawer" data-side="right" aria-labelledby="nav-mobile-title">
    <div class="navigation-drawer"><header><h2 id="nav-mobile-title">Navigasi</h2><button type="button" class="btn" data-variant="ghost" data-dialog-close aria-label="Tutup menu" autofocus>Tutup ×</button></header>
      <nav aria-label="Navigasi seluler">${links}</nav><p>Temukan lokasi. Hubungi bengkel langsung.</p></div>
  </dialog>`;
}
