-- TambalBan — richer tambal_ban attributes + owned submissions.
-- Pivot to the REAL shared table `tambal_ban` (see specs/017-workshop-schema-update).
-- Additive on top of the live schema (name, lat, lon, address, city, province,
-- phone, opening_hours, rating, total_reviews, image_url, source, verified,
-- created_at, updated_at). No drops/renames of columns the Android app reads.
-- Coordinate with tambalban/ (Android, schema owner) before relying on these.

-- =============================================
-- tambal_ban — richer attributes
-- =============================================
ALTER TABLE tambal_ban
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS instagram TEXT,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS osm_id BIGINT,
    ADD COLUMN IF NOT EXISTS osm_tags JSONB,
    ADD COLUMN IF NOT EXISTS motorcycle_tyres BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS car_tyres BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS truck_tyres BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tubeless_repair BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vulcanizer BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS balancing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS spooring BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS roadside_service BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tambal_ban_user ON tambal_ban (user_id);
CREATE INDEX IF NOT EXISTS idx_tambal_ban_source ON tambal_ban (source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tambal_ban_osm_id
    ON tambal_ban (osm_id) WHERE osm_id IS NOT NULL;

-- Spec 017 FR-005: user submissions must land as verified=false. The live column
-- defaulted to true, which would publish a client that forgot to send `verified`.
-- Existing rows are untouched (defaults only affect new inserts).
ALTER TABLE tambal_ban ALTER COLUMN verified SET DEFAULT false;

-- updated_at trigger (function name kept unique — update_updated_at_column is taken)
CREATE OR REPLACE FUNCTION set_tambal_ban_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tambal_ban_updated_at ON tambal_ban;
CREATE TRIGGER update_tambal_ban_updated_at
    BEFORE UPDATE ON tambal_ban
    FOR EACH ROW EXECUTE FUNCTION set_tambal_ban_updated_at();

-- =============================================
-- Owned submissions: stamp the submitter on insert.
-- The Android app does not send user_id; this trigger fills it from the JWT so
-- the WITH CHECK below holds for both apps without client changes.
-- =============================================
CREATE OR REPLACE FUNCTION set_tambal_ban_user_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.user_id = COALESCE(NEW.user_id, auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_tambal_ban_user_id ON tambal_ban;
CREATE TRIGGER set_tambal_ban_user_id
    BEFORE INSERT ON tambal_ban
    FOR EACH ROW EXECUTE FUNCTION set_tambal_ban_user_id();

-- =============================================
-- RLS
-- =============================================
-- INSERT: authenticated only, and the row must belong to the caller. The trigger
-- above guarantees user_id = auth.uid() for logged-in clients.
DROP POLICY IF EXISTS user_insert ON tambal_ban;
CREATE POLICY user_insert ON tambal_ban
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Fix: previously ANY authenticated user could read every unverified row.
-- Now a user can only see their own unverified submissions; verified rows stay
-- public via `public_read_verified`.
DROP POLICY IF EXISTS user_read_own_unverified ON tambal_ban;
CREATE POLICY user_read_own_unverified ON tambal_ban
    FOR SELECT USING (verified OR (source = 'user' AND user_id = auth.uid()));

-- Admin reviews happen via the service_role key (bypasses RLS) or a dashboard
-- UPDATE that flips verified = true — no extra policy needed.

-- =============================================
-- Cleanup: dead function from the retired `workshops`/`workshop_submissions`
-- design. It references tables that no longer exist — calling it always errors.
-- =============================================
DROP FUNCTION IF EXISTS public.approve_workshop_submission(uuid);
