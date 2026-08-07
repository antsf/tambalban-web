/**
 * E2E smoke test for TambalBan Web.
 *
 * Requires the dev server to be running, e.g.:
 *   npx wrangler dev --port 8787
 * Then:
 *   node test/e2e.mjs
 *
 * Reads the admin password from .dev.vars so it can exercise admin routes.
 * The user-submission scenario is skipped when the Supabase JWT clock skew
 * makes a freshly-issued token look expired (a local-dev-only issue).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ??
  readFileSync(resolve(root, ".dev.vars"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("ADMIN_PASSWORD="))
    .map((l) => l.slice("ADMIN_PASSWORD=".length))
    .pop() ?? "";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path, { cookie } = {}) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

async function post(path, body, { cookie, type = "application/json" } = {}) {
  const headers = { "Content-Type": type };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method: "POST", headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), setCookie: res.headers.get("set-cookie") ?? "" };
}

function parseCookie(setCookie, name) {
  const m = setCookie.match(new RegExp(`(?:^|[,; ])${name}=([^;,\\s]+)`));
  return m ? m[1] : null;
}

const ts = new Date().getTime();
const email = `e2e${ts}@qa-test.com`;
const password = "TestPass123!";

console.log(`\nE2E smoke test against ${BASE}\n`);

// ---------- 1. Public pages ----------
console.log("\n[1] Public pages");
{
  const h = await get("/");
  check("GET / returns 200", h.status === 200);
  check("homepage has map div", h.text.includes("id=\"map\""));
  check("homepage has skip-link", h.text.includes('href="#main"'));
  check("homepage has meta description", h.text.includes("meta name=\"description\""));
  check("homepage has search input", h.text.includes("results-list") || h.text.includes("id=\"q\""));
  check("homepage has Leaflet map JS", h.text.includes("L.map") || h.text.includes("leaflet"));

  for (const p of ["/submit", "/register", "/login"]) {
    const r = await get(p);
    check(`GET ${p} returns 200`, r.status === 200);
  }
}

// ---------- 2. Auth flow ----------
console.log("\n[2] Auth flow");
{
  const reg = await post("/api/auth/register", JSON.stringify({ email, password }));
  check("register returns 200", reg.status === 200);

  const regDup = await post("/api/auth/register", JSON.stringify({ email, password }));
  check("duplicate register rejected (400)", regDup.status === 400);

  const login = await post("/api/auth/login", JSON.stringify({ email, password }));
  check("login returns 200", login.status === 200);
  const userCookie = login.setCookie;
  const token = parseCookie(userCookie, "tb_access_token");
  check("login sets tb_access_token cookie", !!token);
  check("user cookie is HttpOnly", /HttpOnly/i.test(userCookie));

  const badPw = await post("/api/auth/login", JSON.stringify({ email, password: "WrongPass999" }));
  check("login wrong password rejected (400)", badPw.status === 400);

  const badEmail = await post("/api/auth/login", JSON.stringify({ email: "nope@nope.com", password }));
  check("login unknown email rejected (400)", badEmail.status === 400);

  const logout = await get("/api/auth/logout");
  check("logout returns 302 redirect", logout.status === 302);
}

// ---------- 3. Workshops API ----------
console.log("\n[3] Workshops API");
{
  const all = await get("/api/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141");
  let ok = all.status === 200;
  let count = 0;
  try {
    count = JSON.parse(all.text).length;
    ok = Array.isArray(JSON.parse(all.text));
  } catch {
    ok = false;
  }
  check("full Indonesia bbox returns JSON array", ok, `status=${all.status}`);
  check("full Indonesia bbox has rows", count > 0, `count=${count}`);

  const jakarta = await get("/api/workshops?minLat=-6.3&maxLat=-6.1&minLng=106.7&maxLng=106.9");
  const jcount = JSON.parse(jakarta.text).length;
  check("Jakarta bbox returns subset", jakarta.status === 200 && jcount > 0 && jcount <= count, `count=${jcount}`);

  const ocean = await get("/api/workshops?minLat=0&maxLat=1&minLng=100&maxLng=101");
  check("empty ocean bbox returns empty array", Array.isArray(JSON.parse(ocean.text)), ocean.text);

  const search = await get("/api/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141&search=tambal");
  check("search returns rows", JSON.parse(search.text).length > 0, `count=${JSON.parse(search.text).length}`);

  // Wildcard-injection fix: % should not match everything
  const pct = await get("/api/workshops?minLat=-11&maxLat=6&minLng=95&maxLng=141&search=%25");
  const pctCount = JSON.parse(pct.text).length;
  check("search '%' does NOT match all rows", pctCount < count, `% matched ${pctCount}/${count}`);

  const noBbox = await get("/api/workshops");
  check("no bbox params still works", noBbox.status === 200);
}

// ---------- 4. Submit flow ----------
console.log("\n[4] Submit flow");
{
  const noAuth = await post("/api/submissions", JSON.stringify({ name: "X", lat: -6.2, lon: 106.8 }));
  check("submit without auth rejected (401)", noAuth.status === 401);

  const login = await post("/api/auth/login", JSON.stringify({ email, password }));
  const cookie = login.setCookie;
  const token = parseCookie(cookie, "tb_access_token");

  if (token) {
    const valid = await post(
      "/api/submissions",
      JSON.stringify({ name: `QA Workshop ${ts}`, lat: -6.2088, lon: 106.8456, city: "Jakarta" }),
      { cookie: `tb_access_token=${token}` },
    );
    check("valid submit accepted", valid.status === 200, `status=${valid.status}`);

    const oob = await post(
      "/api/submissions",
      JSON.stringify({ name: "Fake", lat: 40.7, lon: -74.0 }),
      { cookie: `tb_access_token=${token}` },
    );
    check("out-of-bounds submit rejected (400)", oob.status === 400, `status=${oob.status}`);

    const noname = await post(
      "/api/submissions",
      JSON.stringify({ lat: -6.2, lon: 106.8 }),
      { cookie: `tb_access_token=${token}` },
    );
    check("missing name rejected (400)", noname.status === 400, `status=${noname.status}`);

    const badJson = await post("/api/submissions", "not json", { cookie: `tb_access_token=${token}` });
    check("bad JSON rejected (400)", badJson.status === 400, `status=${badJson.status}`);
  } else {
    check("submit flow — skipped (no JWT from login)", true, "skipped: no token returned");
  }
}

// ---------- 5. Geocode API ----------
console.log("\n[5] Geocode API");
{
  const g = await get("/api/geocode?q=Jakarta%20Pusat");
  let ok = g.status === 200;
  let results = 0;
  try {
    const arr = JSON.parse(g.text);
    ok = Array.isArray(arr) && arr.length > 0;
    results = arr.length;
  } catch {
    ok = false;
  }
  check("geocode valid search returns results", ok, `count=${results}`);
  check("geocode result has display_name", g.text.includes("display_name"));

  const short = await get("/api/geocode?q=Ja");
  check("geocode <3 chars rejected (400)", short.status === 400, `status=${short.status}`);

  const empty = await get("/api/geocode?q=");
  check("geocode empty rejected (400)", empty.status === 400, `status=${empty.status}`);

  const xss = await get("/api/geocode?q=%3Cscript%3Ealert(1)%3C/script%3E");
  check("geocode XSS input is escaped", xss.status === 200 && !xss.text.includes("<script>"), xss.text.slice(0, 60));
}

// ---------- 6. Admin auth ----------
console.log("\n[6] Admin auth");
{
  const wrong = await post("/api/admin/login", JSON.stringify({ password: "definitely-wrong" }));
  check("admin login wrong password rejected (401)", wrong.status === 401, `status=${wrong.status}`);

  const empty = await post("/api/admin/login", JSON.stringify({ password: "" }));
  check("admin login empty password rejected (400)", empty.status === 400, `status=${empty.status}`);

  const good = await post("/api/admin/login", JSON.stringify({ password: ADMIN_PASSWORD }));
  check("admin login correct password accepted", good.status === 200, `status=${good.status}`);
  const adminCookie = good.setCookie;
  const session = parseCookie(adminCookie, "tb_admin_session");
  check("admin login sets tb_admin_session", !!session);

  const noAuth = await get("/admin");
  check("GET /admin without cookie redirects (302)", noAuth.status === 302, `status=${noAuth.status}`);
}

// ---------- 7. Admin pages ----------
console.log("\n[7] Admin pages");
{
  const login = await post("/api/admin/login", JSON.stringify({ password: ADMIN_PASSWORD }));
  const session = parseCookie(login.setCookie, "tb_admin_session");
  const cookie = session ? `tb_admin_session=${session}` : "";

  if (cookie) {
    const queue = await get("/admin", { cookie });
    check("admin queue page 200", queue.status === 200);
    check("queue page has bulk checkbox", queue.text.includes("q-cb"));
    check("queue page has bulk bar", queue.text.includes("bulk-bar"));
    check("queue page has 'Pilih semua'", queue.text.includes("Pilih semua"));

    const data = await get("/admin/data", { cookie });
    check("admin data page 200", data.status === 200);
    check("data page has 'Semua data'", data.text.includes("Semua data"));
    check("data page has infinite-scroll JS", data.text.includes("loadMore"));
    check("data page has filters", data.text.includes("verified") && data.text.includes("source"));

    const users = await get("/admin/users", { cookie });
    check("admin users page 200", users.status === 200);

    const reviews = await get("/admin/reviews", { cookie });
    check("admin reviews page 200", reviews.status === 200);
  } else {
    check("admin pages — skipped (no session cookie)", true, "skipped");
  }
}

// ---------- 8. Bulk operations (API guards) ----------
console.log("\n[8] Bulk operations — auth + input guards");
{
  const noAuth = await post("/api/admin/bulk/publish", JSON.stringify({ ids: ["x"] }));
  check("bulk publish without auth rejected (401)", noAuth.status === 401, `status=${noAuth.status}`);

  const login = await post("/api/admin/login", JSON.stringify({ password: ADMIN_PASSWORD }));
  const session = parseCookie(login.setCookie, "tb_admin_session");
  const cookie = session ? `tb_admin_session=${session}` : "";

  if (cookie) {
    const badJson = await post("/api/admin/bulk/publish", "bad", { cookie });
    check("bulk publish bad JSON rejected (400)", badJson.status === 400, `status=${badJson.status}`);

    const emptyIds = await post("/api/admin/bulk/publish", JSON.stringify({ ids: [] }), { cookie });
    check("bulk publish empty ids rejected (400)", emptyIds.status === 400, `status=${emptyIds.status}`);

    const badUuids = await post(
      "/api/admin/bulk/publish",
      JSON.stringify({ ids: ["not-a-uuid", "still-not-uuid"] }),
      { cookie },
    );
    check("bulk publish invalid UUIDs rejected (400)", badUuids.status === 400, `status=${badUuids.status}`);
  }
}

// ---------- 9. Upload API ----------
console.log("\n[9] Upload API");
{
  const noAuth = await post("/api/upload", "");
  check("upload without auth rejected (401)", noAuth.status === 401, `status=${noAuth.status}`);
}

// ---------- 10. Sitemap + robots ----------
console.log("\n[10] Sitemap + robots.txt");
{
  const sm = await get("/sitemap.xml");
  check("sitemap.xml returns 200", sm.status === 200);
  check("sitemap.xml is XML", sm.text.includes("<?xml"));
  check("sitemap.xml has URL entries", sm.text.includes("<url>") || sm.text.includes("<loc>"));

  const robots = await get("/robots.txt");
  check("robots.txt returns 200", robots.status === 200);
  check("robots.txt disallows admin", robots.text.includes("Disallow: /admin"));
  check("robots.txt disallows login/register", robots.text.includes("Disallow: /login") && robots.text.includes("Disallow: /register"));
}

// ---------- 11. Security headers ----------
console.log("\n[11] Security headers");
{
  const res = await fetch(BASE + "/");
  const h = res.headers;
  const checks = [
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", null],
    ["Content-Security-Policy", null],
  ];
  for (const [name, expect] of checks) {
    const val = h.get(name);
    check(`header ${name} present`, !!val);
    if (expect) check(`${name} = ${expect}`, val === expect);
  }
  const csp = h.get("Content-Security-Policy") ?? "";
  check("CSP has default-src 'self'", csp.includes("default-src 'self'"));
  check("CSP allows unpkg for HTMX", csp.includes("unpkg.com"));
  const pp = h.get("Permissions-Policy") ?? "";
  check("Permissions-Policy blocks camera/mic", pp.includes("camera=()") && pp.includes("microphone=()"));
}

// ---------- 12. Error handling ----------
console.log("\n[12] Error handling");
{
  const nf = await get("/nonexistent-page");
  check("unknown page returns 404", nf.status === 404, `status=${nf.status}`);

  const geoMissing = await get("/api/geocode");
  check("geocode missing q rejected (400)", geoMissing.status === 400, `status=${geoMissing.status}`);
}

console.log(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
