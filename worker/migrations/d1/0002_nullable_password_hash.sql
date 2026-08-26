-- Allow users.password_hash to be NULL, for rows created by the historical data migration
-- (Phase 3) whose password can't be carried over from Supabase Auth's GoTrue hash format.
-- Those users get password_hash=NULL until "migrate on first login" succeeds (see
-- specs/d1-migration-plan.md — decided 2026-08-26).
--
-- SQLite has no ALTER COLUMN; recreate the table (the standard safe pattern), preserving
-- any rows that already exist.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO users_new SELECT * FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TRIGGER trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
