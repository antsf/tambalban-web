#!/usr/bin/env node
/**
 * Phase 3 of the Supabase -> D1 migration: transform a Postgres dump into a
 * SQLite-compatible SQL file for `wrangler d1 execute`.
 *
 * Inputs (workspace root, gitignored — never commit these, contain PII):
 *   - public_data.sql   pg_dump --data-only --schema=public output
 *                        (tables: tambal_ban, reviews, users_profile)
 *   - auth_users.csv    COPY (SELECT id, email, created_at FROM auth.users)
 *
 * Output:
 *   - d1_load.sql (workspace root, gitignored) — INSERT statements matching
 *     worker/migrations/d1/0001_init.sql
 *
 * Usage:
 *   node scripts/migrate-supabase-to-d1.mjs
 *   npx wrangler d1 execute tambalban-db --remote --file=../d1_load.sql   # from worker/
 *
 * password_hash is always NULL for migrated users: Phase 3a (migrate-on-first-login,
 * see specs/d1-migration-plan.md) verifies against Supabase Auth on next login and
 * backfills the PBKDF2 hash lazily. We never touch bcrypt password hashes here.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const DUMP_PATH = path.join(ROOT, "public_data.sql");
const AUTH_CSV_PATH = path.join(ROOT, "auth_users.csv");
const OUT_PATH = path.join(ROOT, "d1_load.sql");

function unescapeCopyField(raw) {
  if (raw === "\\N") return null;
  return raw
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\");
}

function parseCopyBlock(sql, tableName) {
  const startMarker = `COPY public.${tableName} (`;
  const startIdx = sql.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`COPY block for ${tableName} not found`);
  const headerEnd = sql.indexOf(") FROM stdin;\n", startIdx);
  const columns = sql
    .slice(startIdx + startMarker.length, headerEnd)
    .split(", ")
    .map((c) => c.trim());
  const bodyStart = headerEnd + ") FROM stdin;\n".length;
  const rest = sql.slice(bodyStart);
  const terminator = rest.match(/^\\\.$/m);
  if (!terminator) throw new Error(`COPY terminator for ${tableName} not found`);
  const body = rest.slice(0, terminator.index).replace(/\n$/, "");
  const rows = body === "" ? [] : body.split("\n").map((line) => line.split("\t").map(unescapeCopyField));
  return { columns, rows };
}

function toRowObjects({ columns, rows }) {
  return rows.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

function parseAuthUsersCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const [id, email, created_at] = line.split(",");
    return Object.fromEntries(columns.map((col, i) => [col, [id, email, created_at][i]]));
  });
}

function pgBoolToInt(v) {
  if (v === null) return null;
  return v === "t" ? 1 : 0;
}

function pgTimestampToIso(v) {
  if (v === null) return null;
  // "2026-03-15 15:25:13.081817+00" -> "2026-03-15T15:25:13.081Z"
  const m = v.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (!m) return v;
  const ms = m[3] ? m[3].slice(1, 4).padEnd(3, "0") : "000";
  return `${m[1]}T${m[2]}.${ms}Z`;
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertStatement(table, columns, values) {
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.map(sqlLiteral).join(", ")});`;
}

async function main() {
  const [dumpSql, authCsv] = await Promise.all([
    readFile(DUMP_PATH, "utf8"),
    readFile(AUTH_CSV_PATH, "utf8"),
  ]);

  const authUsers = parseAuthUsersCsv(authCsv);
  const profiles = toRowObjects(parseCopyBlock(dumpSql, "users_profile"));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const userStatements = authUsers.map((u) => {
    const p = profileById.get(u.id);
    const columns = ["id", "email", "password_hash", "username", "full_name", "phone", "avatar_url", "created_at", "updated_at"];
    const values = [
      u.id,
      u.email,
      null, // password_hash: filled lazily on first login (Phase 3a)
      p?.username ?? null,
      p?.full_name ?? null,
      p?.phone ?? null,
      p?.avatar_url ?? null,
      pgTimestampToIso(u.created_at) ?? pgTimestampToIso(p?.created_at),
      pgTimestampToIso(p?.updated_at) ?? pgTimestampToIso(u.created_at),
    ];
    return insertStatement("users", columns, values);
  });

  const workshops = toRowObjects(parseCopyBlock(dumpSql, "tambal_ban"));
  const workshopStatements = workshops.map((w) => {
    const columns = [
      "id", "name", "lat", "lon", "address", "city", "province", "district", "phone",
      "whatsapp", "website", "instagram", "opening_hours", "image_url", "source",
      "verified", "verified_at", "user_id", "osm_id", "osm_tags",
      "motorcycle_tyres", "car_tyres", "truck_tyres", "tubeless_repair", "vulcanizer",
      "balancing", "spooring", "roadside_service", "created_at", "updated_at",
    ];
    const values = [
      w.id, w.name, Number(w.lat), Number(w.lon), w.address, w.city, w.province, w.district, w.phone,
      w.whatsapp, w.website, w.instagram, w.opening_hours, w.image_url, w.source,
      pgBoolToInt(w.verified), pgTimestampToIso(w.verified_at), w.user_id,
      w.osm_id === null ? null : Number(w.osm_id), w.osm_tags,
      pgBoolToInt(w.motorcycle_tyres), pgBoolToInt(w.car_tyres), pgBoolToInt(w.truck_tyres),
      pgBoolToInt(w.tubeless_repair), pgBoolToInt(w.vulcanizer), pgBoolToInt(w.balancing),
      pgBoolToInt(w.spooring), pgBoolToInt(w.roadside_service),
      pgTimestampToIso(w.created_at), pgTimestampToIso(w.updated_at),
    ];
    return insertStatement("tambal_ban", columns, values);
  });

  const reviews = toRowObjects(parseCopyBlock(dumpSql, "reviews"));
  const reviewStatements = reviews.map((r) => {
    const columns = ["id", "workshop_id", "user_id", "rating", "comment", "created_at"];
    const values = [r.id, r.workshop_id, r.user_id, Number(r.rating), r.comment, pgTimestampToIso(r.created_at)];
    return insertStatement("reviews", columns, values);
  });

  const sql = [
    "-- Generated by scripts/migrate-supabase-to-d1.mjs — do not hand-edit.",
    "PRAGMA defer_foreign_keys = TRUE;",
    "",
    `-- users (${userStatements.length})`,
    ...userStatements,
    "",
    `-- tambal_ban (${workshopStatements.length})`,
    ...workshopStatements,
    "",
    `-- reviews (${reviewStatements.length})`,
    ...reviewStatements,
    "",
  ].join("\n");

  await writeFile(OUT_PATH, sql, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  users:      ${userStatements.length}`);
  console.log(`  tambal_ban: ${workshopStatements.length}`);
  console.log(`  reviews:    ${reviewStatements.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
