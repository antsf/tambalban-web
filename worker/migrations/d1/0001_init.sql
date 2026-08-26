-- TambalBan D1 schema (Phase 1 of the Supabase -> D1 migration).
-- See ../../../specs/d1-migration-plan.md for the full design rationale.
--
-- Differences from the Postgres reference (../../../../tambalban/supabase_schema.sql):
--   - uuid -> TEXT (app-generated via crypto.randomUUID(), no DB default)
--   - jsonb -> TEXT (JSON-serialized in the Worker)
--   - timestamptz -> TEXT ISO-8601
--   - boolean -> INTEGER (0/1)
--   - rating/total_reviews on tambal_ban: dropped, origin untraceable, not replicated
--   - auth.users + users_profile merged into one `users` table
--   - RLS policies become explicit WHERE clauses / guards in Worker route handlers,
--     not database-level policies (D1 has no RLS)

PRAGMA foreign_keys = ON;

-- =============================================
-- users (merges Supabase auth.users + users_profile)
-- =============================================
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- =============================================
-- sessions (replaces GoTrue JWT issuance)
-- =============================================
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- =============================================
-- tambal_ban (the ONE workshop table, shared Android + Web)
-- =============================================
-- Both apps read/write this table. Visibility is controlled by `verified`:
--   verified = 1 -> shown on the public map (both apps)
--   verified = 0 -> hidden; only its owner (user_id) can see it (enforced in Worker, not RLS)
-- `source` records provenance: 'osm' (OSM scraper) or 'user' (manual submit).
CREATE TABLE tambal_ban (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    address TEXT,
    city TEXT,
    province TEXT,
    district TEXT,
    phone TEXT,
    whatsapp TEXT,
    website TEXT,
    instagram TEXT,
    opening_hours TEXT,
    image_url TEXT,
    source TEXT NOT NULL DEFAULT 'osm',
    verified INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    osm_id INTEGER,
    osm_tags TEXT,
    motorcycle_tyres INTEGER NOT NULL DEFAULT 0,
    car_tyres INTEGER NOT NULL DEFAULT 0,
    truck_tyres INTEGER NOT NULL DEFAULT 0,
    tubeless_repair INTEGER NOT NULL DEFAULT 0,
    vulcanizer INTEGER NOT NULL DEFAULT 0,
    balancing INTEGER NOT NULL DEFAULT 0,
    spooring INTEGER NOT NULL DEFAULT 0,
    roadside_service INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_tambal_ban_location ON tambal_ban(lat, lon);
CREATE INDEX idx_tambal_ban_name ON tambal_ban(name);
CREATE INDEX idx_tambal_ban_source ON tambal_ban(source);
CREATE INDEX idx_tambal_ban_user ON tambal_ban(user_id);
CREATE UNIQUE INDEX idx_tambal_ban_osm_id ON tambal_ban(osm_id) WHERE osm_id IS NOT NULL;

CREATE TRIGGER trg_tambal_ban_updated_at
AFTER UPDATE ON tambal_ban
FOR EACH ROW
BEGIN
    UPDATE tambal_ban SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

-- =============================================
-- reviews
-- =============================================
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    workshop_id TEXT REFERENCES tambal_ban(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_reviews_workshop ON reviews(workshop_id);
