/* TambalBan client boundary. One installation; DOM-keyed ownership, no page globals. */
(() => {
  'use strict';
  if (window.TambalBanUI) { window.TambalBanUI.init(); return; }
  const maps = new Map();
  const dialogs = new WeakSet();
  let leafletPromise;
  let pagination = null;
  let bulkController = null;
  const byId = id => document.getElementById(id);
  const text = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inIndonesia = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -11 && lat <= 6 && lon >= 95 && lon <= 141;
  const services = { motorcycle_tyres: 'Ban motor', car_tyres: 'Ban mobil', truck_tyres: 'Ban truk', tubeless_repair: 'Tambal tubeless', vulcanizer: 'Vulkanisir', balancing: 'Balancing', spooring: 'Spooring', roadside_service: 'Servis panggilan' };
  const boostedLink = 'hx-boost="true" hx-target="#page-shell" hx-select="#page-shell" hx-swap="outerHTML"';
  function contactLinks(row) {
    const result = [];
    const whatsapp = String(row.whatsapp || '').replace(/\D/g, '');
    const phone = String(row.phone || '').replace(/[^+\d()-]/g, '');
    if (whatsapp) result.push(`<a href="https://wa.me/${escape(whatsapp)}" class="contact-link">WhatsApp</a>`);
    if (phone) result.push(`<a href="tel:${escape(phone)}" class="contact-link">Telepon</a>`);
    // A persisted URL is still untrusted. Escaping alone cannot block javascript:.
    try {
      const url = new URL(row.website);
      if (['http:', 'https:'].includes(url.protocol)) result.push(`<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer" class="contact-link">Website ↗</a>`);
    } catch (_) { /* no public website */ }
    return result.join('');
  }
  function popup(row) {
    return `<div class="workshop-popup"><strong>${escape(row.name)}</strong><p>${escape([row.address, row.city, row.province].filter(Boolean).join(', '))}</p>${row.opening_hours ? `<p>Jam tercatat: ${escape(row.opening_hours)}</p>` : ''}<a href="/workshops/${encodeURIComponent(row.id)}" ${boostedLink}>Lihat detail →</a><div class="contact-links">${contactLinks(row)}</div></div>`;
  }
  function resultRow(row) {
    const available = Object.keys(services).filter(key => row[key]).slice(0, 3);
    return `<li class="result-row" data-workshop-id="${escape(row.id)}"><div class="result-top"><a class="result-name" href="/workshops/${encodeURIComponent(row.id)}" ${boostedLink}>${escape(row.name)}</a><button type="button" class="btn" data-variant="ghost" data-action="select-workshop" data-id="${escape(row.id)}" aria-label="Tunjukkan ${escape(row.name)} di peta" aria-pressed="false">Peta ↗</button></div><p class="result-address">${escape([row.address, row.city].filter(Boolean).join(', ') || 'Alamat belum dicatat')}</p>${available.length ? `<p class="service-tags">${available.map(key => `<span class="badge">${services[key]}</span>`).join('')}</p>` : ''}<div class="contact-links">${contactLinks(row)}</div></li>`;
  }
  function toast(message, error = false) {
    const target = byId('toast');
    if (target) target.innerHTML = `<div class="alert notice-${error ? 'error' : 'success'}" role="${error ? 'alert' : 'status'}"><p>${escape(message)}</p></div>`;
  }
  function alive(state) { return !state.disposed && state.container.isConnected && maps.get(state.container) === state; }
  function discovery() { return Array.from(maps.values()).find(state => state.kind === 'discovery'); }
  function picker() { return Array.from(maps.values()).find(state => state.kind === 'picker'); }
  function busy(value) { const el = byId('map-status'); if (el) el.setAttribute('aria-busy', String(value)); }
  function resize(state) {
    if (!alive(state)) return;
    state.map.invalidateSize({ pan: false });
  }
  function markSelected(state, id) {
    state.selected = id;
    document.querySelectorAll('[data-workshop-id]').forEach(row => {
      const selected = row.dataset.workshopId === id;
      row.classList.toggle('is-selected', selected);
      row.querySelector('[data-action="select-workshop"]')?.setAttribute('aria-pressed', String(selected));
    });
  }
  function selectWorkshop(id) {
    const state = discovery();
    const marker = state?.markers.get(id);
    if (!marker) return;
    markSelected(state, id);
    state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 14), { animate: !reducedMotion() });
    marker.openPopup();
    state.container.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  function schedule(state) {
    // Invalidate immediately, not after debounce: even a transport ignoring abort
    // cannot paint yesterday's search while a new user intent is pending.
    clearTimeout(state.timer);
    state.controller?.abort();
    state.sequence++;
    state.timer = setTimeout(() => load(state), 250);
  }
  async function load(state) {
    if (!alive(state)) return;
    clearTimeout(state.timer);
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    const sequence = ++state.sequence;
    const bounds = state.map.getBounds();
    const params = new URLSearchParams({
      minLat: Math.max(-90, bounds.getSouth()).toFixed(4), maxLat: Math.min(90, bounds.getNorth()).toFixed(4),
      minLng: Math.max(-180, bounds.getWest()).toFixed(4), maxLng: Math.min(180, bounds.getEast()).toFixed(4),
    });
    const query = byId('q')?.value.trim();
    if (query) params.set('search', query);
    busy(true);
    text('map-hint', 'Memuat lokasi bengkel…');
    const retry = byId('retry-map'); if (retry) retry.hidden = true;
    try {
      const response = await fetch('/api/workshops?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid workshop response');
      if (!alive(state) || sequence !== state.sequence) return;
      state.layer.clearLayers(); state.markers.clear();
      for (const row of rows) {
        if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
        const marker = window.L.marker([row.lat, row.lon], { title: row.name, alt: row.name }).addTo(state.layer).bindPopup(popup(row));
        marker.on('click', () => markSelected(state, row.id));
        state.markers.set(row.id, marker);
      }
      text('count', rows.length + ' bengkel di area peta');
      text('map-hint', rows.length ? 'Pilih bengkel untuk detail atau hubungi langsung.' : 'Belum ada bengkel di area ini. Geser peta, ubah pencarian, atau tambah lokasi bengkel.');
      const list = byId('results-list');
      if (list) { list.innerHTML = rows.map(resultRow).join(''); window.htmx?.process(list); }
      markSelected(state, state.selected);
    } catch (error) {
      if (!alive(state) || sequence !== state.sequence || error.name === 'AbortError') return;
      text('map-hint', 'Gagal memuat bengkel. Periksa koneksi dan coba lagi. Hasil sebelumnya mungkin tidak sesuai area baru.');
      if (!state.markers.size) text('count', 'Data belum tersedia');
      if (retry) retry.hidden = false;
    } finally {
      if (alive(state) && sequence === state.sequence) busy(false);
    }
  }
  function setPin(state, lat, lon, zoom = true, writeCoordinates = true) {
    if (!alive(state)) return;
    if (!inIndonesia(lat, lon)) { text('pick-note', 'Koordinat di luar Indonesia. Pilih lokasi di wilayah Indonesia.'); return; }
    if (state.pin) state.map.removeLayer(state.pin);
    state.pin = window.L.marker([lat, lon]).addTo(state.map);
    if (writeCoordinates) {
      if (byId('lat')) byId('lat').value = lat.toFixed(6);
      if (byId('lon')) byId('lon').value = lon.toFixed(6);
    }
    text('pick-note', 'Titik dipilih: ' + lat.toFixed(5) + ', ' + lon.toFixed(5));
    if (zoom) state.map.setView([lat, lon], 15, { animate: !reducedMotion() });
  }
  function syncPin() {
    const state = picker();
    if (!state || !byId('lat')?.value || !byId('lon')?.value) return;
    // Manual fields are authoritative; update only the preview on commit.
    setPin(state, Number(byId('lat').value), Number(byId('lon').value), true, false);
  }
  function locate() {
    const state = discovery() || picker();
    const status = state?.kind === 'picker' ? 'geocode-msg' : 'location-status';
    if (!state) { text(status, 'Peta belum siap. Coba lagi setelah peta dimuat.'); return; }
    if (!navigator.geolocation) { text(status, 'Lokasi tidak tersedia di peramban ini. Cari atau geser peta.'); return; }
    const attempt = ++state.locationAttempt;
    text(status, 'Mencari lokasi Anda…');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive(state) || attempt !== state.locationAttempt) return;
      const { latitude: lat, longitude: lon } = position.coords;
      if (!inIndonesia(lat, lon)) { text(status, 'Lokasi Anda di luar Indonesia. Cari alamat atau pilih titik di peta.'); return; }
      if (state.kind === 'picker') setPin(state, lat, lon);
      else state.map.setView([lat, lon], 14, { animate: !reducedMotion() });
      text(status, 'Peta dipusatkan ke lokasi Anda. Posisi perangkat bisa kurang akurat.');
    }, error => {
      if (!alive(state) || attempt !== state.locationAttempt) return;
      text(status, error.code === 1 ? 'Akses lokasi ditolak. Izinkan lokasi di peramban, atau cari dan geser peta.' : 'Lokasi tidak ditemukan. Coba lagi atau cari alamat.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }
  async function geocode() {
    const state = picker(); const query = byId('addr')?.value.trim();
    if (!state) return;
    if (!query || query.length < 3) { text('geocode-msg', 'Masukkan minimal 3 karakter alamat atau nama kota.'); return; }
    state.geocodeController?.abort();
    const controller = new AbortController(); state.geocodeController = controller;
    text('geocode-msg', 'Mencari alamat…');
    try {
      const response = await fetch('/api/geocode?' + new URLSearchParams({ q: query }), { signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const rows = await response.json();
      if (!alive(state) || state.geocodeController !== controller) return;
      if (!Array.isArray(rows) || !rows.length) { text('geocode-msg', 'Alamat tidak ditemukan. Coba nama jalan atau kota yang lebih spesifik.'); return; }
      const row = rows[0];
      if (!inIndonesia(row.lat, row.lon)) { text('geocode-msg', 'Hasil di luar Indonesia. Pilih titik di peta.'); return; }
      setPin(state, row.lat, row.lon);
      text('geocode-msg', row.display_name || 'Alamat ditemukan. Periksa titik sebelum mengirim.');
      if (byId('address') && !byId('address').value) byId('address').value = row.display_name || '';
    } catch (error) {
      if (alive(state) && state.geocodeController === controller && error.name !== 'AbortError') text('geocode-msg', 'Gagal mencari alamat. Periksa koneksi lalu coba lagi.');
    }
  }
  const uploads = new Map();
  async function uploadPhoto(input) {
    const form = input.closest('form'); const file = input.files?.[0];
    if (!form || form !== document.querySelector('form[hx-post="/api/submissions"]')) return;
    uploads.get(form)?.abort(); uploads.delete(form);
    if (byId('image_url')) byId('image_url').value = '';
    if (!file) { text('photo-status', ''); return; }
    // Upload belongs to the contributor form, not a successfully loaded map.
    const controller = new AbortController(); uploads.set(form, controller);
    const current = () => form.isConnected && input.isConnected && uploads.get(form) === controller && form === document.querySelector('form[hx-post="/api/submissions"]');
    const data = new FormData(); data.append('file', file);
    text('photo-status', 'Mengunggah foto…');
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: data, signal: controller.signal });
      const result = await response.json();
      if (!current()) return;
      if (!response.ok || !result.url) throw new Error(result.error || 'Gagal mengunggah foto.');
      if (byId('image_url')) byId('image_url').value = result.url;
      text('photo-status', 'Foto diunggah.');
    } catch (error) {
      if (!current() || error.name === 'AbortError') return;
      text('photo-status', error.message || 'Gagal mengunggah. Coba lagi.'); input.value = '';
    } finally { if (uploads.get(form) === controller) uploads.delete(form); }
  }
  function ensureLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet]')) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.dataset.leaflet = ''; document.head.append(css);
      }
      const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve(); script.onerror = () => { script.remove(); leafletPromise = null; reject(new Error('Leaflet unavailable')); }; document.head.append(script);
    });
    return leafletPromise;
  }
  function mount(container) {
    if (!container.isConnected || maps.has(container) || !window.L) return;
    // History may contain a serialized Leaflet id/class but never a live instance.
    container.replaceChildren(); container.classList.remove('leaflet-container');
    const kind = container.dataset.map;
    let view = kind === 'picker' ? [-6.2, 106.8, 11] : [-2.5, 118, 5];
    try { const cached = JSON.parse(container.dataset.mapView || 'null'); if (Array.isArray(cached) && cached.length === 3 && cached.every(Number.isFinite)) view = cached; } catch (_) { /* default view */ }
    const map = window.L.map(container, { zoomAnimation: !reducedMotion(), fadeAnimation: !reducedMotion() }).setView(view.slice(0, 2), view[2]);
    const state = { container, map, kind, markers: new Map(), sequence: 0, locationAttempt: 0, disposed: false, selected: container.dataset.selectedWorkshop || null };
    maps.set(container, state);
    const tiles = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    tiles.on('tileerror', () => { if (alive(state)) text(kind === 'picker' ? 'pick-note' : 'location-status', 'Latar peta belum tersedia. Periksa koneksi; daftar dan koordinat tetap dapat digunakan.'); });
    if (kind === 'discovery') { state.layer = window.L.layerGroup().addTo(map); map.on('moveend', () => schedule(state)); load(state); }
    else if (kind === 'picker') { map.on('click', event => setPin(state, event.latlng.lat, event.latlng.lng, false)); syncPin(); }
    if (typeof ResizeObserver !== 'undefined') {
      let lastWidth = 0, lastHeight = 0;
      state.observer = new ResizeObserver(entries => {
        const size = entries[0]?.contentRect;
        if (!size || (size.width === lastWidth && size.height === lastHeight)) return;
        lastWidth = size.width; lastHeight = size.height; resize(state);
      });
      state.observer.observe(container);
    }
    requestAnimationFrame(() => resize(state));
  }
  function destroy(state) {
    if (state.disposed) return;
    // Save only data, never Leaflet-managed DOM or JS instance ids in HTMX history.
    if (state.map.getCenter) { const center = state.map.getCenter(); state.container.dataset.mapView = JSON.stringify([center.lat, center.lng, state.map.getZoom()]); }
    state.container.dataset.selectedWorkshop = state.selected || '';
    state.disposed = true; state.sequence++; state.locationAttempt++;
    clearTimeout(state.timer); state.controller?.abort(); state.geocodeController?.abort(); state.uploadController?.abort();
    state.observer?.disconnect(); state.map.off(); state.map.remove(); state.container.replaceChildren();
    maps.delete(state.container);
  }
  // Private pages stay hx-history=false. Keep contributor drafts only in this
  // live page's memory, not localStorage/history HTML; logout/full navigation clears it.
  let submissionDraft = null;
  function captureSubmissionDraft() {
    const form = document.querySelector('form[hx-post="/api/submissions"]');
    if (!form) return;
    submissionDraft = {};
    for (const field of form.elements) {
      if (!field.name || field.type === 'file' || field.type === 'submit' || field.type === 'button' || /password|token|secret|csrf|authorization/i.test(field.name)) continue;
      submissionDraft[field.name] = { value: field.value, checked: field.checked };
    }
  }
  function restoreSubmissionDraft() {
    const form = document.querySelector('form[hx-post="/api/submissions"]');
    if (!form || !submissionDraft || form.dataset.draftRestored) return;
    for (const field of form.elements) {
      const saved = submissionDraft[field.name]; if (!saved || field.type === 'file') continue;
      field.value = saved.value;
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = saved.checked;
    }
    form.dataset.draftRestored = 'true';
    if (byId('image_url')?.value) text('photo-status', 'Foto diunggah.');
  }
  function currentAdminFilters() {
    const form = document.querySelector('form[hx-target="#data-list"]');
    const params = form ? new URLSearchParams(new FormData(form)) : new URLSearchParams(window.location.search);
    for (const name of ['search', 'verified', 'source']) if (!params.get(name)) params.delete(name);
    params.delete('offset');
    return params.toString();
  }
  function init(options = {}) {
    window.basecoat?.initAll(options);
    for (const [form, controller] of uploads) if (!form.isConnected) { controller.abort(); uploads.delete(form); }
    restoreSubmissionDraft();
    for (const state of maps.values()) { if (!state.container.isConnected) destroy(state); else resize(state); }
    document.querySelectorAll('dialog.drawer').forEach(dialog => {
      if (dialogs.has(dialog)) return;
      dialogs.add(dialog);
      dialog.addEventListener('close', () => {
        const trigger = byId('nav-toggle'); trigger?.setAttribute('aria-expanded', 'false');
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
      // An open dialog serialized by history has no top-layer membership.
      dialog.removeAttribute('open'); dialog.removeAttribute('data-closing');
    });
    const containers = Array.from(document.querySelectorAll('[data-map]'));
    if (window.L) containers.forEach(mount);
    else if (containers.length) ensureLeaflet().then(() => containers.forEach(mount)).catch(() => {
      text('map-hint', 'Gagal memuat peta. Periksa koneksi lalu coba lagi.'); const retry = byId('retry-map'); if (retry) retry.hidden = false;
      text('pick-note', 'Peta gagal dimuat. Isi koordinat manual atau muat ulang halaman.'); busy(false);
    });
    const list = byId('data-list');
    if (list && pagination?.list !== list) {
      pagination?.controller?.abort();
      pagination = { list, busy: false, filtering: false, filters: list.dataset.filters ?? currentAdminFilters(), exhausted: list.dataset.exhausted === 'true' };
    }
    updateBulkBar();
  }
  function dispose(target) {
    for (const [form, controller] of uploads) if (!target || target === form || target.contains?.(form)) { controller.abort(); uploads.delete(form); }
    for (const state of Array.from(maps.values())) if (!target || target === state.container || target.contains?.(state.container)) destroy(state);
    if (!target || target.id === 'page-shell' || target.id === 'data-wrap') { pagination?.controller?.abort(); pagination = null; }
    if (!target || target.id === 'page-shell') { bulkController?.abort(); bulkController = null; }
  }
  function selectedIds() { return Array.from(document.querySelectorAll('.q-cb:checked')).map(box => box.dataset.id); }
  function updateBulkBar() {
    const bar = byId('bulk-bar'); if (!bar) return;
    const ids = selectedIds(); bar.classList.toggle('hidden', !ids.length); text('bulk-count', ids.length + ' dipilih');
    const all = document.querySelector('[data-select-all]');
    if (all) { const total = document.querySelectorAll('.q-cb').length; all.checked = total > 0 && ids.length === total; all.indeterminate = ids.length > 0 && ids.length < total; }
  }
  async function bulk(action) {
    if (bulkController) return;
    const ids = selectedIds(); const queue = byId('queue'); if (!ids.length || !queue) return;
    if (action === 'remove' && !window.confirm('Hapus ' + ids.length + ' kiriman?')) return;
    const controller = new AbortController(); bulkController = controller;
    const buttons = Array.from(document.querySelectorAll('#bulk-bar button')); buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch('/api/admin/bulk/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), signal: controller.signal });
      if (!response.ok) throw new Error();
      if (!queue.isConnected || bulkController !== controller) return;
      queue.querySelectorAll('li[data-id]').forEach(row => { if (ids.includes(row.dataset.id)) row.remove(); });
      const count = queue.querySelectorAll('li[data-id]').length;
      const heading = document.querySelector('#main h1'); if (heading) heading.textContent = 'Antrian kiriman (' + count + ')';
      if (!count) queue.innerHTML = '<li class="card queue-empty">Tidak ada kiriman menunggu.</li>';
      updateBulkBar(); toast(ids.length + (action === 'publish' ? ' kiriman diterbitkan.' : ' kiriman dihapus.'));
    } catch (error) { if (queue.isConnected && error.name !== 'AbortError') toast('Gagal memproses kiriman. Muat ulang antrian dan coba lagi.', true); }
    finally { if (bulkController === controller) bulkController = null; buttons.forEach(button => { if (button.isConnected) button.disabled = false; }); }
  }
  async function loadMore() {
    const state = pagination; const button = byId('load-more');
    if (!state || state.busy || state.filtering || !button) return;
    // Pagination belongs to the rendered dataset, not an unapplied edit.
    const params = new URLSearchParams(state.filters);
    const limit = Number(state.list.dataset.limit) || 100;
    const next = (Number(state.list.dataset.offset) || 0) + state.list.querySelectorAll('li[data-id]').length;
    params.set('offset', String(next)); params.set('limit', String(limit));
    const controller = new AbortController(); state.controller = controller; state.busy = true; button.disabled = true; button.textContent = 'Memuat…';
    try {
      const response = await fetch('/api/admin/workshops?' + params, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const html = await response.text();
      if (state !== pagination || state.controller !== controller || !state.list.isConnected) return;
      // Server returns authored/escaped fragments for subsequent pages.
      const fragment = document.createElement('template'); fragment.innerHTML = html;
      const rows = fragment.content.querySelectorAll('li[data-id]');
      if (rows.length) { state.list.insertAdjacentHTML('beforeend', html); window.htmx?.process(state.list); }
      state.exhausted = rows.length < limit; state.list.dataset.exhausted = String(state.exhausted);
      button.hidden = state.exhausted;
    } catch (error) { if (state === pagination && error.name !== 'AbortError') toast('Gagal memuat data. Coba lagi.', true); }
    finally {
      if (state === pagination && state.controller === controller) {
        state.busy = false; state.controller = null;
        if (button.isConnected) { button.disabled = state.filtering; button.textContent = 'Muat lebih banyak'; }
      }
    }
  }
  document.addEventListener('click', event => {
    const open = event.target.closest?.('[data-dialog-open]');
    if (open) { const dialog = byId(open.dataset.dialogOpen); if (dialog) { open.setAttribute('aria-expanded', 'true'); dialog.showModal(); } return; }
    const close = event.target.closest?.('[data-dialog-close]'); if (close) { close.closest('dialog')?.close(); return; }
    // Close before navigation so an outgoing modal never leaves a stale top layer.
    const navigation = event.target.closest?.('dialog a'); if (navigation) navigation.closest('dialog')?.close();
    const button = event.target.closest?.('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'retry-map') { init(); refresh(); }
    else if (action === 'locate') locate();
    else if (action === 'select-workshop') selectWorkshop(button.dataset.id);
    else if (action === 'geocode') geocode();
    else if (action === 'bulk-publish') bulk('publish');
    else if (action === 'bulk-remove') bulk('remove');
    else if (action === 'bulk-clear') { document.querySelectorAll('.q-cb').forEach(box => { box.checked = false; }); updateBulkBar(); }
    else if (action === 'load-more') loadMore();
    else if (action === 'toggle-password') { const input = byId(button.getAttribute('aria-controls')); if (input) { const visible = input.type === 'password'; input.type = visible ? 'text' : 'password'; button.setAttribute('aria-pressed', String(visible)); button.textContent = visible ? 'Sembunyikan password' : 'Tampilkan password'; } }
  });
  document.addEventListener('submit', event => { if (event.target.id === 'discovery-search') { event.preventDefault(); refresh(); } });
  document.addEventListener('input', event => {
    if (event.target.id === 'q') { const state = discovery(); if (state) schedule(state); }
  });
  document.addEventListener('change', event => {
    if (['lat', 'lon'].includes(event.target.id)) syncPin();
    if (event.target.id === 'photo') uploadPhoto(event.target);
    if (event.target.matches?.('[data-select-all]')) document.querySelectorAll('.q-cb').forEach(box => { box.checked = event.target.checked; });
    if (event.target.matches?.('.q-cb, [data-select-all]')) updateBulkBar();
  });
  document.addEventListener('keydown', event => { if (event.target.id === 'addr' && event.key === 'Enter') { event.preventDefault(); geocode(); } });
  document.addEventListener('htmx:beforeRequest', event => {
    if (event.detail.elt?.closest?.('form[hx-target="#data-list"]')) {
      pagination?.controller?.abort();
      if (pagination) {
        pagination.controller = null; pagination.busy = false; pagination.filtering = true;
        pagination.filterXhr = event.detail.xhr; pagination.nextFilters = currentAdminFilters();
        const button = byId('load-more'); if (button) { button.disabled = true; button.textContent = 'Muat lebih banyak'; }
      }
    }
  });
  document.addEventListener('htmx:afterRequest', event => {
    if (pagination && pagination.filterXhr === event.detail.xhr) {
      pagination.filtering = false;
      const button = byId('load-more'); if (button) button.disabled = pagination.busy;
    }
  });
  document.addEventListener('htmx:afterSwap', event => {
    if (event.detail.target?.id === 'data-list' && pagination && pagination.filterXhr === event.detail.xhr) {
      pagination.filters = pagination.nextFilters; pagination.list.dataset.filters = pagination.filters;
      pagination.list.dataset.offset = '0';
    }
  });
  document.addEventListener('htmx:configRequest', event => {
    if (event.detail.path === '/api/admin/workshops') {
      for (const name of ['search', 'verified', 'source']) if (event.detail.parameters[name] === '') delete event.detail.parameters[name];
    }
  });
  document.addEventListener('htmx:beforeSwap', event => {
    if (event.detail.shouldSwap === false) return;
    const target = event.detail.target;
    if (target?.id === 'data-list' && pagination?.filterXhr && event.detail.xhr !== pagination.filterXhr) {
      event.detail.shouldSwap = false; return;
    }
    if (target?.id === 'page-shell') {
      captureSubmissionDraft();
      document.querySelectorAll('dialog[open]').forEach(dialog => { dialog._destroy?.(); dialog.close(); });
    }
    dispose(target);
  });
  document.addEventListener('htmx:afterSettle', event => {
    init();
    if (event.detail.target?.id === 'data-list') {
      const count = byId('data-list')?.querySelectorAll('li[data-id]').length || 0;
      const old = byId('load-more');
      if (pagination) {
        pagination.exhausted = count < (Number(pagination.list.dataset.limit) || 100);
        pagination.list.dataset.exhausted = String(pagination.exhausted);
        if (old) old.hidden = pagination.exhausted;
      }
    }
    if (event.detail.target?.id === 'page-shell') byId('main')?.focus({ preventScroll: true });
  });
  document.addEventListener('htmx:beforeHistorySave', () => {
    // Serialize clean map containers, then restore live DOM if no swap follows.
    for (const field of document.querySelectorAll('input, textarea, select')) {
      if (field.type === 'password' || field.type === 'file' || /password|token|secret|csrf|authorization/i.test(field.name || '') || /password/i.test(field.autocomplete || '')) continue;
      if (field.type === 'hidden' && field.name !== 'image_url') continue;
      if (field.type === 'checkbox' || field.type === 'radio') field.defaultChecked = field.checked;
      else if (field.tagName === 'SELECT') for (const option of field.options) option.defaultSelected = option.selected;
      else field.defaultValue = field.value;
    }
    captureSubmissionDraft();
    document.querySelectorAll('dialog[open]').forEach(dialog => { dialog._destroy?.(); dialog.close(); });
    dispose(); queueMicrotask(() => init({ force: true }));
  });
  document.addEventListener('htmx:historyRestore', () => init({ force: true }));
  document.addEventListener('htmx:sendError', () => toast('Koneksi terputus. Periksa koneksi dan coba lagi.', true));
  window.addEventListener('resize', () => { for (const state of maps.values()) resize(state); if (window.matchMedia('(min-width: 960px)').matches) byId('nav-mobile')?.close(); });
  function refresh() { const state = discovery(); if (state) load(state); }
  if (window.htmx) {
    // Only authored API form fragments accept 4xx/5xx. Never replace the shell
    // with an error body selected as if it were a successful page navigation.
    window.htmx.config.responseHandling = [{ code: '204', swap: false }, { code: '[23]..', swap: true }, { code: '[45]..', swap: false, error: true }, { code: '...', swap: false }];
    document.addEventListener('htmx:beforeSwap', event => { if (event.detail.target?.id === 'toast') { event.detail.shouldSwap = true; event.detail.isError = false; } });
  }
  window.TambalBanUI = Object.freeze({ init, dispose, refresh });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init()); else init();
})();
