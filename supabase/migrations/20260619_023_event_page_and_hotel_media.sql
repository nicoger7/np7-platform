-- 20260619_023_event_page_and_hotel_media.sql
-- Additive-only (see NOTION-SUPABASE-SYNC.md golden rule). Two features:
--   1. Per-experience event-page template selector (defaults to the current design).
--   2. Hotel media + a package→hotel link, so the public "Accommodation" step can
--      show the real hotel name and preview photos.
-- Safe to run multiple times.

-- ── 1. Event-page template ──────────────────────────────────
-- 'full' = the current rich layout. More templates (e.g. 'compact' for small
-- events) can be added later; the column drives which layout the public page renders.
ALTER TABLE exp_experiences ADD COLUMN IF NOT EXISTS page_template TEXT NOT NULL DEFAULT 'full';

-- ── 2. Hotel media ──────────────────────────────────────────
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS image_url   TEXT;          -- primary preview photo
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS images      TEXT[] DEFAULT '{}';  -- extra gallery photos
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS description TEXT;          -- short blurb shown in the picker
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS website     TEXT;

-- ── 3. Package → hotel link ─────────────────────────────────
-- Nullable: "no hotel" packages stay NULL. ON DELETE SET NULL so removing a
-- hotel never deletes packages.
ALTER TABLE exp_packages ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exp_packages_hotel ON exp_packages(hotel_id);
