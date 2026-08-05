-- TambalBan Web — extends workshop_submissions for the admin review flow.
-- Run in the same Supabase project as the Android app (supabase_schema.sql).

ALTER TABLE workshop_submissions
    ADD COLUMN IF NOT EXISTS open_time TEXT,
    ADD COLUMN IF NOT EXISTS close_time TEXT,
    ADD COLUMN IF NOT EXISTS is_24h BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS approved_workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL;

-- workshop_submissions RLS already allows public INSERT + SELECT via
-- supabase_schema.sql. The admin review routes use the service_role key,
-- which bypasses RLS entirely, so no admin-specific policy is added here.
