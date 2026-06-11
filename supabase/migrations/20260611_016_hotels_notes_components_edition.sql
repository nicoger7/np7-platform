-- ============================================================
-- 20260611_016_hotels_notes_components_edition.sql
--   1. hotels table (manageable list + prefix) seeded from the
--      previously hardcoded hotel names
--   2. edition_notes table (timestamped notes with author)
--   3. exp_components.edition_id (replaces the year[] text field
--      as the canonical "which edition does this belong to")
--   4. allow free-form component categories (drop CHECK if any)
-- ============================================================

-- ── 1. Hotels ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  prefix TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service all hotels" ON hotels;
CREATE POLICY "service all hotels" ON hotels FOR ALL USING (true);

INSERT INTO hotels (name, prefix) VALUES
  ('Sorobon', 'SOR'),
  ('Wanapa', 'WAN'),
  ('Playa Surf', 'PLS'),
  ('Hotel Paradiso', 'PAR'),
  ('Alacati', 'ALA'),
  ('REF', 'REF'),
  ('REF II', 'REF2')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Edition notes (author + timestamp burned in) ────────
CREATE TABLE IF NOT EXISTS edition_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES exp_editions(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE edition_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service all edition_notes" ON edition_notes;
CREATE POLICY "service all edition_notes" ON edition_notes FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_edition_notes_edition ON edition_notes(edition_id);

-- ── 3. Components belong to editions (not "year") ──────────
ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;

-- Backfill: experience-specific components inherit the experience's
-- single edition where unambiguous (skip multi-edition experiences).
UPDATE exp_components c
   SET edition_id = sub.ed_id
  FROM (
    SELECT e.experience_id, MIN(e.id::text)::uuid AS ed_id
    FROM exp_editions e
    GROUP BY e.experience_id
    HAVING COUNT(*) = 1
  ) sub
 WHERE c.experience_id = sub.experience_id
   AND c.edition_id IS NULL;

-- ── 4. Free-form component categories ───────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'exp_components'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%category%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE exp_components DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;
