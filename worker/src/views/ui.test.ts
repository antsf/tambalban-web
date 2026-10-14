import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest runs in Node; Worker production deliberately has no Node ambient types.
import { readFileSync } from "node:fs";
// @ts-expect-error Vitest runs in Node; Worker production deliberately has no Node ambient types.
import { runInNewContext } from "node:vm";
import { layout, field, checkbox, errorToast } from "./layout";
import { homePage, loginPage, registerPage, submitPage, adminQueuePage, adminAllDataPage } from "./pages";

// UI1/UI2/UI3: the server contract stays real Hono HTML, not a mockup.
describe("shared Basecoat rendering", () => {
  it("uses the approved emerald action accent without changing the existing logo identity", () => {
    // @ts-expect-error Node ESM URL exists in Vitest, not the Worker type library.
    const css = readFileSync(new URL('../styles/input.css', import.meta.url), 'utf8');
    // @ts-expect-error Node ESM URL exists in Vitest, not the Worker type library.
    const logo = readFileSync(new URL('../../public/icon.svg', import.meta.url), 'utf8');
    expect(css).toMatch(/--primary:\s*#047857;/i);
    expect(css).toMatch(/--ring:\s*#047857;/i);
    expect(logo).toContain('fill="#8A2BE2"');
  });
  it("self-hosts pinned official assets and loads only core + the used drawer module", () => {
    const html = layout({ title: "Peta", active: "home" }, "<p>Content</p>");
    expect(html).toContain('/vendor/basecoat/1.0.2/basecoat.cdn.min.css');
    expect(html).toContain('/vendor/basecoat/1.0.2/basecoat.min.js');
    expect(html).toContain('/vendor/basecoat/1.0.2/drawer.min.js');
    expect(html).not.toContain('all.min.js');
    expect(html).toContain('<script src="/ui.js" defer');
    expect(html).toContain('id="page-shell"');
    expect(html).toContain('hx-select="#page-shell"');
  });
  it("provides a modal mobile drawer with keyboard/focus semantics and current navigation", () => {
    const html = layout({ title: "Masuk", active: "login" }, "");
    expect(html).toContain('<dialog id="nav-mobile" class="drawer"');
    expect(html).toContain('aria-controls="nav-mobile"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-dialog-close');
  });
  it("sets the legacy layer order before official CSS and applies brand overrides afterwards", () => {
    const html = homePage();
    expect(html.indexOf('@layer theme, base, legacy, components, utilities;')).toBeGreaterThan(-1);
    expect(html.indexOf('@layer theme, base, legacy, components, utilities;')).toBeLessThan(html.indexOf('/vendor/basecoat/1.0.2/basecoat.cdn.min.css'));
    expect(html.indexOf('/vendor/basecoat/1.0.2/basecoat.cdn.min.css')).toBeLessThan(html.indexOf('/tailwind.css'));
  });
  it("uses escaped Basecoat fields with hint association and preserves JSON form contracts", () => {
    const html = field('email', 'Email <x>', '\"<script>', { required: true, hint: 'Petunjuk', autocomplete: 'email' });
    expect(html).toContain('class="input"');
    expect(html).toContain('aria-describedby="email-hint"');
    expect(html).toContain('id="email-hint"');
    expect(html).toContain('&lt;script&gt;');
    expect(checkbox('car_tyres', 'Ban mobil', false)).toContain('class="checkbox"');
    expect(errorToast('<script>')).toContain('role="alert"');
    for (const [render, route] of [[loginPage(), '/api/auth/login'], [registerPage(), '/api/auth/register'], [submitPage('local@example.test'), '/api/submissions']] as const) {
      expect(render).toContain(`hx-post="${route}"`);
      expect(render).toContain('hx-ext="json-enc"');
      expect(render).toContain('hx-target="#toast"');
    }
  });
  it("renders a map-first discovery surface with reachable results, location, retry and no availability claims", () => {
    const html = homePage();
    expect(html).toContain('class="discovery-grid"');
    expect(html).toContain('id="map" data-map="discovery"');
    expect(html).toContain('href="#results-panel"');
    expect(html).toContain('data-action="locate"');
    expect(html).toContain('data-action="retry-map"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('Buka sekarang');
    expect(html).not.toContain('const map=');
  });
  it("leaves moderation routes and existing filtering/selection surfaces intact", () => {
    const queue = adminQueuePage([]);
    expect(queue).toContain('id="queue"');
    expect(queue).toContain('id="bulk-bar"');
    expect(adminAllDataPage([], {})).toContain('hx-get="/api/admin/workshops"');
    expect(submitPage('local@example.test')).toContain('id="pick" data-map="picker"');
    expect(submitPage(null)).not.toContain('data-map="picker"');
  });
  it("renders the actual pagination limit and starting offset for the client", () => {
    const html = adminAllDataPage([], { limit: 20, offset: 40 });
    expect(html).toContain('name="limit" value="20"');
    expect(html).toContain('data-offset="40" data-limit="20"');
  });
  it("synchronizes admin filter controls to one replacement request owner", () => {
    expect(adminAllDataPage([], {})).toContain('hx-sync="closest form:replace"');
  });
});

// A deliberately small DOM/Leaflet boundary fake exercises the actual client script.
// Browser focus, CSS, native dialog and real Leaflet are verified separately in Edge.
// TODO: replace permissive VM-only fake shapes with typed DOM/Leaflet interfaces.
function clientHarness() {
  const listeners = new Map<string, Array<(event: any) => void>>();
  const nodes = new Map<string, any>();
  const state = { created: 0, removed: 0, resized: 0, basecoat: [] as unknown[], requests: [] as any[] };
  const node = (id: string) => ({ id, dataset: {} as Record<string, string>, isConnected: true, children: [], value: '', textContent: '', hidden: false,
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, replaceChildren() { this.children = []; },
    querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {}, removeEventListener() {},
    contains(other: any) { return other === this; }, append() {}, matches() { return false; }, getBoundingClientRect() { return { width: 800, height: 500 }; },
  });
  ['count', 'map-hint', 'results-list', 'q', 'results-panel', 'location-status', 'map-status', 'retry-map'].forEach(id => nodes.set(id, node(id)));
  const maps: any[] = [];
  const formFields: any[] = [];
  const forms = new Map<string, any>();
  const document: any = { readyState: 'complete', body: node('body'), documentElement: node('html'),
    addEventListener(name: string, cb: any) { listeners.set(name, [...(listeners.get(name) || []), cb]); },
    getElementById(id: string) { return nodes.get(id) || null; },
    querySelector(selector: string) { return selector === '[data-map]' ? maps[0] || null : forms.get(selector) || null; },
    querySelectorAll(selector: string) { return selector === '[data-map]' ? maps : selector === 'input, textarea, select' ? formFields : []; },
    createElement(tag: string) { return node(tag); },
  };
  const leafletMap = { setView() { return this; }, on() { return this; }, off() { return this; },
    getBounds() { return { getSouth: () => -10, getNorth: () => 5, getWest: () => 96, getEast: () => 140 }; },
    invalidateSize() { state.resized++; }, remove() { state.removed++; }, stop() {},
  };
  const L = { map() { state.created++; return leafletMap; }, tileLayer() { return { addTo() { return { on() {} }; } }; },
    layerGroup() { return { addTo() { return this; }, clearLayers() {} }; },
    marker() { return { addTo() { return this; }, bindPopup() { return this; }, on() { return this; } }; },
  };
  const fetch = (url: string, opts: any) => new Promise<any>(resolve => state.requests.push({ url, opts, resolve }));
  const window: any = { L, document, basecoat: { initAll(opts: any) { state.basecoat.push(opts); } },
    matchMedia: () => ({ matches: true }), addEventListener() {}, location: { search: '', href: 'http://localhost/' },
    setTimeout, clearTimeout, requestAnimationFrame: (fn: any) => { fn(); return 1; }, cancelAnimationFrame() {},
  };
  // @ts-expect-error import.meta.url exists in Vitest's Node ESM runtime, not the Worker type library.
  runInNewContext(readFileSync(new URL('../../public/ui.js', import.meta.url), 'utf8'), {
    window, document, navigator: {}, fetch, AbortController, URLSearchParams, URL, console,
    FormData: class { constructor(private form: any = { values: {} }) {} append(name: string, value: unknown) { this.form.values[name] = value; } [Symbol.iterator]() { return Object.entries(this.form.values)[Symbol.iterator](); } },
    setTimeout, clearTimeout, queueMicrotask, requestAnimationFrame: window.requestAnimationFrame,
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  return { state, nodes, maps, formFields, forms, window, node, event(name: string, detail: any) { for (const cb of listeners.get(name) || []) cb({ detail, target: detail?.elt || document.body }); } };
}

describe("swap/history/Leaflet lifecycle", () => {
  it("uploads a contributor photo even when no Leaflet picker exists", async () => {
    const h = clientHarness();
    const form = { ...h.node('submission'), elements: [] };
    h.forms.set('form[hx-post="/api/submissions"]', form);
    const image = h.node('image_url'); const status = h.node('photo-status');
    h.nodes.set('image_url', image); h.nodes.set('photo-status', status);
    h.event('change', { elt: { id: 'photo', files: [{ name: 'qa.png' }], isConnected: true, closest() { return form; }, matches() { return false; } } });
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.requests[0].url).toBe('/api/upload');
    h.state.requests[0].resolve({ ok: true, json: async () => ({ url: '/images/workshops/qa.webp' }) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(image.value).toBe('/images/workshops/qa.webp'); expect(status.textContent).toBe('Foto diunggah.');
    h.window.TambalBanUI.dispose();
  });
  function paginationHarness() {
    const h = clientHarness();
    const list = h.node('data-list'); list.dataset.limit = '20';
    list.querySelectorAll = () => Array.from({ length: 20 }, () => h.node('row')) as never[];
    const button = { ...h.node('load-more'), disabled: false, dataset: { action: 'load-more' } };
    const form = { values: { search: 'initial', verified: '', source: '', limit: '20' }, closest() { return this; } };
    h.nodes.set('data-list', list); h.nodes.set('load-more', button);
    h.forms.set('form[hx-target="#data-list"]', form); h.window.TambalBanUI.init();
    const click = () => h.event('click', { elt: { closest(selector: string) { return selector === '[data-action]' ? button : null; } } });
    return { h, form, click };
  }
  it("keeps pagination on the query that produced the displayed list", () => {
    const { h, form, click } = paginationHarness();
    form.values.search = 'unsubmitted'; click();
    expect(h.state.requests).toHaveLength(1);
    expect(h.state.requests[0].url).toContain('search=initial');
    expect(h.state.requests[0].url).not.toContain('unsubmitted');
    h.window.TambalBanUI.dispose();
  });
  it("does not paginate while a replacement filter request is pending", () => {
    const { h, form, click } = paginationHarness();
    h.event('htmx:beforeRequest', { elt: form, xhr: {} }); click();
    expect(h.state.requests).toHaveLength(0);
    h.window.TambalBanUI.dispose();
  });
  it("does not normalize or rewrite manual coordinates while typing", () => {
    const h = clientHarness();
    const container = h.node('pick'); container.dataset.map = 'picker'; h.maps.push(container);
    const lat = h.node('lat'); const lon = h.node('lon');
    h.nodes.set('lat', lat); h.nodes.set('lon', lon);
    h.window.TambalBanUI.init();
    lat.value = '-1'; lon.value = '106';
    h.event('input', { elt: lat });
    expect(lat.value).toBe('-1'); expect(lon.value).toBe('106');
    h.window.TambalBanUI.dispose();
  });
  it("serializes noncredential draft/search state before caching HTML, never passwords or tokens", () => {
    const h = clientHarness();
    const search: any = { tagName: 'INPUT', type: 'search', name: 'search', value: 'Bandung', defaultValue: '' };
    const image: any = { tagName: 'INPUT', type: 'hidden', name: 'image_url', value: '/images/workshops/qa.webp', defaultValue: '' };
    const check: any = { tagName: 'INPUT', type: 'checkbox', name: 'tubeless_repair', checked: true, defaultChecked: false };
    const password: any = { tagName: 'INPUT', type: 'text', name: 'password', value: 'must-not-cache', defaultValue: '' };
    const token: any = { tagName: 'INPUT', type: 'hidden', name: 'access_token', value: 'must-not-cache', defaultValue: '' };
    h.formFields.push(search, image, check, password, token);
    h.event('htmx:beforeHistorySave', {});
    expect(search.defaultValue).toBe('Bandung'); expect(image.defaultValue).toBe('/images/workshops/qa.webp'); expect(check.defaultChecked).toBe(true);
    expect(password.defaultValue).toBe(''); expect(token.defaultValue).toBe('');
    h.window.TambalBanUI.dispose();
  });
  it("omits empty optional enum filters from the actual admin HTMX request", () => {
    const h = clientHarness();
    const parameters: any = { search: '', verified: '', source: '', limit: '20' };
    h.event('htmx:configRequest', { path: '/api/admin/workshops', parameters });
    expect(parameters).toEqual({ limit: '20' });
    const active: any = { search: 'Bandung', verified: 'false', source: 'user' };
    h.event('htmx:configRequest', { path: '/api/admin/workshops', parameters: active });
    expect(active).toEqual({ search: 'Bandung', verified: 'false', source: 'user' });
    h.window.TambalBanUI.dispose();
  });
  it("is idempotent for preserved maps and unrelated fragment swaps", () => {
    const h = clientHarness();
    const container = h.node('map'); container.dataset.map = 'discovery'; h.maps.push(container);
    h.window.TambalBanUI.init(); h.window.TambalBanUI.init();
    h.event('htmx:beforeSwap', { target: h.node('toast'), shouldSwap: true });
    h.event('htmx:afterSettle', {});
    expect(h.state.created).toBe(1);
    expect(h.state.removed).toBe(0);
    expect(h.state.resized).toBeGreaterThan(0);
    h.window.TambalBanUI.dispose();
  });
  it("destroys only replaced maps and forces Basecoat reinitialization on history restoration", () => {
    const h = clientHarness();
    const old = h.node('map'); old.dataset.map = 'discovery'; h.maps.push(old);
    h.window.TambalBanUI.init();
    h.event('htmx:beforeSwap', { target: old, shouldSwap: true });
    const next = h.node('map'); next.dataset.map = 'discovery'; h.maps.splice(0, 1, next); old.isConnected = false;
    h.event('htmx:historyRestore', {});
    expect(h.state.removed).toBe(1);
    expect(h.state.created).toBe(2);
    expect(h.state.basecoat).toContainEqual({ force: true });
    h.window.TambalBanUI.dispose();
  });
  it("aborts old searches and ignores out-of-order responses, including ignored aborts", async () => {
    const h = clientHarness();
    const container = h.node('map'); container.dataset.map = 'discovery'; h.maps.push(container);
    h.window.TambalBanUI.init();
    const first = h.state.requests[0];
    h.nodes.get('q').value = 'Bandung';
    h.window.TambalBanUI.refresh();
    const second = h.state.requests[1];
    expect(first.opts.signal.aborted).toBe(true);
    second.resolve({ ok: true, json: async () => [] });
    await new Promise(resolve => setTimeout(resolve, 0));
    first.resolve({ ok: true, json: async () => [{ id: 'stale', name: 'Old response', lat: -6, lon: 106 }] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.nodes.get('count').textContent).toBe('0 bengkel di area peta');
    expect(h.nodes.get('map-hint').textContent).toContain('Belum ada');
    h.window.TambalBanUI.dispose();
  });
  it("checks HTTP status and exposes an explicit retry without discarding data silently", async () => {
    const h = clientHarness();
    const container = h.node('map'); container.dataset.map = 'discovery'; h.maps.push(container);
    h.window.TambalBanUI.init();
    h.state.requests[0].resolve({ ok: false, status: 502, json: async () => ({ error: 'bad' }) });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.nodes.get('map-hint').textContent).toContain('Gagal');
    expect(h.nodes.get('retry-map').hidden).toBe(false);
    h.window.TambalBanUI.dispose();
  });
  it("cleans map DOM before history serialization then remounts a still-connected container", async () => {
    const h = clientHarness();
    const container = h.node('map'); container.dataset.map = 'discovery'; h.maps.push(container);
    h.window.TambalBanUI.init();
    h.event('htmx:beforeHistorySave', {});
    expect(h.state.removed).toBe(1);
    expect(container.children).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(h.state.created).toBe(2);
    expect(h.state.basecoat).toContainEqual({ force: true });
    h.window.TambalBanUI.dispose();
  });
  it("escapes actual workshop results and rejects unsafe website schemes", async () => {
    const h = clientHarness();
    const container = h.node('map'); container.dataset.map = 'discovery'; h.maps.push(container);
    h.window.TambalBanUI.init();
    h.state.requests[0].resolve({ ok: true, json: async () => [{ id: 'quote\"id', name: '<script>alert(1)</script>', address: '\"<img>', lat: -6, lon: 106, website: 'javascript:alert(1)' }] });
    await new Promise(resolve => setTimeout(resolve, 0));
    const html = h.nodes.get('results-list').innerHTML;
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('data-id="quote&quot;id"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    h.window.TambalBanUI.dispose();
  });
});
