-- TambalBan — richer workshop attributes + owned submissions.
-- Additive only: no drops/renames of columns either repo depends on.
-- Runs on the same Supabase project as the Android app (supabase_schema.sql).
-- Coordinate with tambalban/ (Android) before relying on these in the app.

-- =============================================
-- workshops — richer attributes
-- =============================================
ALTER TABLE workshops
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS instagram TEXT,
    ADD COLUMN IF NOT EXISTS opening_hours TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS district TEXT,
    ADD COLUMN IF NOT EXISTS province TEXT,
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
    ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_workshops_source ON workshops (source);
CREATE INDEX IF NOT EXISTS idx_workshops_verified ON workshops (verified);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_osm_id
    ON workshops (osm_id) WHERE osm_id IS NOT NULL;

-- updated_at trigger (same pattern as users_profile)
CREATE OR REPLACE FUNCTION update_workshops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workshops_updated_at ON workshops;
CREATE TRIGGER update_workshops_updated_at
    BEFORE UPDATE ON workshops
    FOR EACH ROW EXECUTE FUNCTION update_workshops_updated_at();

-- =============================================
-- workshop_submissions — owned submissions
-- =============================================
ALTER TABLE workshop_submissions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_user ON workshop_submissions (user_id);

-- RLS: authenticated users only, forced to their own user_id.
-- NOTE: this tightens the old "Anyone can submit / read" policies. The Android app
-- must send the logged-in user's token AND set user_id = auth.uid() in the payload.
DROP POLICY IF EXISTS "Anyone can submit workshop" ON workshop_submissions;
DROP POLICY IF EXISTS "Public can read submissions" ON workshop_submissions;

CREATE POLICY "Authenticated users can submit workshop" ON workshop_submissions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can read own submissions" ON workshop_submissions
    FOR SELECT USING (auth.uid() = user_id);

-- Admin routes read/write via the service_role key, which bypasses RLS — no
-- admin-specific policy needed here.
