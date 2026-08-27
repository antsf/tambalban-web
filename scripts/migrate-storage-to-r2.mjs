#!/usr/bin/env node
/**
 * Phase 4b: copy existing Supabase Storage objects into R2, then rewrite the
 * matching D1 `image_url`/`avatar_url` to the Worker-served /images/... URL
 * (see worker/src/lib/r2.ts for why that's the Worker's own domain, not R2's
 * pub-*.r2.dev — that domain got MITM'd by a carrier content filter).
 *
 * Reads the row lists from JSON files (dumped separately via
 * `wrangler d1 execute --json`) rather than a live D1 connection, since this
 * runs in plain Node, not the Worker runtime, and has no D1 binding.
 *
 * Usage (from worker/):
 *   node ../scripts/migrate-storage-to-r2.mjs \
 *     --workshops ../../firebase-migration/all-workshop-images.json \
 *     --avatars ../../firebase-migration/all-avatar-images.json \
 *     --out ../../firebase-migration/rewrite-image-urls.sql
 *
 * Uploads via `wrangler r2 object put` (shelled out — this script has no R2
 * binding either). Does NOT run the generated SQL; review it, then:
 *   npx wrangler d1 execute tambalban-db --remote --file=<out>
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const SITE_URL = "https://tambalban-web.antsf.workers.dev";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const workshopsPath = arg("workshops");
const avatarsPath = arg("avatars");
const outPath = arg("out", "rewrite-image-urls.sql");
const limit = arg("limit") ? Number(arg("limit")) : Infinity;
if (!workshopsPath || !avatarsPath) {
  console.error("Usage: node migrate-storage-to-r2.mjs --workshops <json> --avatars <json> [--out <sql>]");
  process.exit(1);
}

function loadRows(jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  return data[0].results;
}

function sqlLiteral(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function extOf(url) {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : "jpg").toLowerCase();
}

/** Fresh key per object — source filenames aren't guaranteed unique across the flat
 * source folders (one legacy-Firebase screenshot got reused by two different workshops),
 * and R2's namespace per bucket is flat, so reusing a source name risks a silent overwrite. */
async function migrateOne(bucketName, urlFieldValue, tmpDir) {
  const key = `${crypto.randomUUID()}.${extOf(urlFieldValue)}`;
  const res = await fetch(urlFieldValue);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${urlFieldValue}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const tmpFile = path.join(tmpDir, key);
  writeFileSync(tmpFile, buf);
  await execFileAsync(
    "npx",
    ["wrangler", "r2", "object", "put", `${bucketName}/${key}`, `--file=${tmpFile}`, `--content-type=${contentType}`],
    { shell: true },
  );
  return `${SITE_URL}/images/${bucketName === "tambalban-workshops" ? "workshops" : "avatars"}/${key}`;
}

const CONCURRENCY = 8;

/** Runs `fn` over `items` with at most `CONCURRENCY` in flight — 134 sequential
 * download+upload round trips would take ~2 hours; this cuts it to ~15-20 minutes. */
async function pooledMap(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

async function main() {
  const workshops = loadRows(workshopsPath).slice(0, limit);
  const avatars = limit === Infinity ? loadRows(avatarsPath) : [];
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "r2-migrate-"));
  const total = workshops.length + avatars.length;
  let done = 0;

  let statements;
  try {
    const workshopStatements = await pooledMap(workshops, async (w) => {
      try {
        const newUrl = await migrateOne("tambalban-workshops", w.image_url, tmpDir);
        console.log(`  [${++done}/${total}] workshop ${w.id}`);
        return `UPDATE tambal_ban SET image_url=${sqlLiteral(newUrl)} WHERE id=${sqlLiteral(w.id)};`;
      } catch (err) {
        console.error(`  FAILED workshop ${w.id}: ${err.message}`);
        done++;
        return null;
      }
    });
    const avatarStatements = await pooledMap(avatars, async (u) => {
      try {
        const newUrl = await migrateOne("tambalban-avatars", u.avatar_url, tmpDir);
        console.log(`  [${++done}/${total}] avatar ${u.id}`);
        return `UPDATE users SET avatar_url=${sqlLiteral(newUrl)} WHERE id=${sqlLiteral(u.id)};`;
      } catch (err) {
        console.error(`  FAILED avatar ${u.id}: ${err.message}`);
        done++;
        return null;
      }
    });
    statements = [...workshopStatements, ...avatarStatements].filter(Boolean);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  writeFileSync(outPath, statements.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${statements.length}/${total} UPDATE statements to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
