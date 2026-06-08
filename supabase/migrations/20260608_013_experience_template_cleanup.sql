-- ============================================================
-- 20260608_013_experience_template_cleanup.sql
-- Experience template vs edition cleanup
--   • Experience (template) gains: code, hotels[] (multi-hotel)
--   • Edition gains the moved fields: slug, currency,
--     whatsapp_group_link, total_fixed_costs
--   • Edition slug/code auto-derive from the experience
--
-- NON-DESTRUCTIVE: old experience columns (currency, total_fixed_costs,
-- whatsapp_group_link, whats_included, hotel) are LEFT in place but no
-- longer surfaced in the UI. Drop them later via the optional block at
-- the bottom once both agents are done.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Experience (template) — add code + multi-hotel
-- ────────────────────────────────────────────────────────────
ALTER TABLE exp_experiences ADD COLUMN IF NOT EXISTS code   TEXT;
ALTER TABLE exp_experiences ADD COLUMN IF NOT EXISTS hotels TEXT[];

-- migrate the single `hotel` into the `hotels` array
UPDATE exp_experiences
  SET hotels = ARRAY[hotel]
  WHERE hotel IS NOT NULL
    AND hotel <> ''
    AND (hotels IS NULL OR array_length(hotels, 1) IS NULL);

-- backfill experience.code from an edition's experience_code,
-- stripping a trailing year (e.g. "ALC-2026" → "ALC")
UPDATE exp_experiences e
  SET code = sub.code
  FROM (
    SELECT DISTINCT ON (experience_id)
           experience_id,
           regexp_replace(experience_code, '[-_ ]?\d{4}$', '') AS code
    FROM exp_editions
    WHERE experience_code IS NOT NULL AND experience_code <> ''
    ORDER BY experience_id, year DESC
  ) sub
  WHERE e.id = sub.experience_id
    AND (e.code IS NULL OR e.code = '');

-- ────────────────────────────────────────────────────────────
-- 2. Edition — add the fields moving down from the template
-- ────────────────────────────────────────────────────────────
ALTER TABLE exp_editions ADD COLUMN IF NOT EXISTS slug                TEXT;
ALTER TABLE exp_editions ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'EUR';
ALTER TABLE exp_editions ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT;
ALTER TABLE exp_editions ADD COLUMN IF NOT EXISTS total_fixed_costs   NUMERIC(10,2);

-- backfill currency / whatsapp / fixed costs from the parent experience
UPDATE exp_editions ed
  SET currency            = COALESCE(ed.currency, e.currency, 'EUR'),
      whatsapp_group_link = COALESCE(ed.whatsapp_group_link, e.whatsapp_group_link),
      total_fixed_costs   = COALESCE(ed.total_fixed_costs, e.total_fixed_costs)
  FROM exp_experiences e
  WHERE ed.experience_id = e.id;

-- backfill edition slug = experience-slug + "-" + year
UPDATE exp_editions ed
  SET slug = e.slug || '-' || ed.year::text
  FROM exp_experiences e
  WHERE ed.experience_id = e.id
    AND (ed.slug IS NULL OR ed.slug = '');

-- ────────────────────────────────────────────────────────────
-- 3. OPTIONAL — destructive cleanup. Run only after both agents
--    have stopped touching exp_experiences. Uncomment to apply.
-- ────────────────────────────────────────────────────────────
-- ALTER TABLE exp_experiences
--   DROP COLUMN IF EXISTS currency,
--   DROP COLUMN IF EXISTS total_fixed_costs,
--   DROP COLUMN IF EXISTS whatsapp_group_link,
--   DROP COLUMN IF EXISTS whats_included,
--   DROP COLUMN IF EXISTS hotel;
-- ALTER TABLE exp_editions DROP COLUMN IF EXISTS po_code;
