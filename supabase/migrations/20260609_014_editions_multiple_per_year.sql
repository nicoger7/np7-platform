-- ============================================================
-- 20260609_014_editions_multiple_per_year.sql
-- Allow an experience to have multiple editions in the same year
-- (e.g. consecutive departure weeks), and consolidate the Bonaire
-- winter weeks (I/II/III) into one experience with three editions.
--
-- Run AFTER 20260608_013_experience_template_cleanup.sql.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Editions: add a label + allow multiple per year
-- ────────────────────────────────────────────────────────────
ALTER TABLE exp_editions ADD COLUMN IF NOT EXISTS label TEXT;

-- Drop the one-edition-per-year uniqueness (auto-named by Postgres)
ALTER TABLE exp_editions DROP CONSTRAINT IF EXISTS exp_editions_experience_id_year_key;

-- ────────────────────────────────────────────────────────────
-- 2. Merge Bonaire Week I / II / III into one experience.
--    Week I's experience becomes the canonical "Bonaire Winter Weeks";
--    Week II and III editions (and their dependent rows) re-point to it.
--    The June WindWeek is intentionally left as its own experience.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  canonical UUID;
  w2 UUID;
  w3 UUID;
BEGIN
  SELECT id INTO canonical FROM exp_experiences WHERE title = 'NP7 Bonaire Week I'   LIMIT 1;
  SELECT id INTO w2        FROM exp_experiences WHERE title = 'NP7 Bonaire Week II'  LIMIT 1;
  SELECT id INTO w3        FROM exp_experiences WHERE title = 'NP7 Bonaire Week III' LIMIT 1;

  IF canonical IS NULL THEN
    RAISE NOTICE 'Bonaire Week I not found — skipping merge.';
    RETURN;
  END IF;

  -- Label the canonical (Week I) edition
  UPDATE exp_editions SET label = 'Week I' WHERE experience_id = canonical;

  -- Week II → canonical
  IF w2 IS NOT NULL THEN
    UPDATE exp_editions    SET experience_id = canonical, label = 'Week II' WHERE experience_id = w2;
    UPDATE exp_packages    SET experience_id = canonical WHERE experience_id = w2;
    UPDATE exp_bookings    SET experience_id = canonical WHERE experience_id = w2;
    UPDATE exp_costs       SET experience_id = canonical WHERE experience_id = w2;
    UPDATE exp_hotel_rooms SET experience_id = canonical WHERE experience_id = w2;
    UPDATE hours_log       SET experience_id = canonical WHERE experience_id = w2;
    UPDATE scenario_planner SET experience_id = canonical WHERE experience_id = w2;
    DELETE FROM exp_experiences WHERE id = w2;
  END IF;

  -- Week III → canonical
  IF w3 IS NOT NULL THEN
    UPDATE exp_editions    SET experience_id = canonical, label = 'Week III' WHERE experience_id = w3;
    UPDATE exp_packages    SET experience_id = canonical WHERE experience_id = w3;
    UPDATE exp_bookings    SET experience_id = canonical WHERE experience_id = w3;
    UPDATE exp_costs       SET experience_id = canonical WHERE experience_id = w3;
    UPDATE exp_hotel_rooms SET experience_id = canonical WHERE experience_id = w3;
    UPDATE hours_log       SET experience_id = canonical WHERE experience_id = w3;
    UPDATE scenario_planner SET experience_id = canonical WHERE experience_id = w3;
    DELETE FROM exp_experiences WHERE id = w3;
  END IF;

  -- Rename the canonical experience + refresh its code
  UPDATE exp_experiences
     SET title = 'NP7 Bonaire Winter Weeks',
         slug  = 'np7-bonaire-winter-weeks',
         code  = COALESCE(code, 'BONW')
   WHERE id = canonical;

  -- Regenerate edition slugs/codes from the canonical experience + label
  UPDATE exp_editions
     SET slug = 'np7-bonaire-winter-weeks-' ||
                regexp_replace(lower(COALESCE(label, year::text)), '[^a-z0-9]+', '-', 'g'),
         experience_code = 'BONW-' ||
                regexp_replace(upper(COALESCE(label, year::text)), '[^A-Z0-9]+', '', 'g')
   WHERE experience_id = canonical;
END $$;
