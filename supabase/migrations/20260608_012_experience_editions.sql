-- ============================================================
-- 20260608_012_experience_editions.sql
-- Experience Editions Refactor: templates + per-year editions
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Create exp_editions table
-- ────────────────────────────────────────────────────────────
CREATE TABLE exp_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES exp_experiences(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  date_start DATE,
  date_end DATE,
  price_from NUMERIC(10,2),
  price_to NUMERIC(10,2),
  deposit NUMERIC(10,2),
  max_spots INTEGER,
  spots_taken INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived','private')),
  coaches TEXT,
  experience_code TEXT,
  po_code TEXT,
  pricing_details TEXT,
  payment_page_id TEXT,
  estimated_costs NUMERIC(10,2),
  expected_revenue NUMERIC(10,2),
  expected_profit NUMERIC(10,2),
  paid_revenue NUMERIC(10,2),
  paid_profit NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  notion_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experience_id, year)
);

-- ────────────────────────────────────────────────────────────
-- 2. Populate editions from existing experiences
--    Each experience → one edition (year extracted from date_start, default 2026)
-- ────────────────────────────────────────────────────────────
INSERT INTO exp_editions (
  experience_id,
  year,
  date_start,
  date_end,
  price_from,
  price_to,
  deposit,
  max_spots,
  spots_taken,
  status,
  coaches,
  experience_code,
  po_code,
  pricing_details,
  payment_page_id,
  estimated_costs,
  expected_revenue,
  expected_profit,
  paid_revenue,
  paid_profit,
  active,
  notion_id,
  created_at,
  updated_at
)
SELECT
  id AS experience_id,
  COALESCE(EXTRACT(YEAR FROM date_start)::INTEGER, 2026) AS year,
  date_start,
  date_end,
  price_from,
  price_to,
  deposit,
  max_spots,
  COALESCE(spots_taken, 0) AS spots_taken,
  CASE
    WHEN status IN ('draft','published','archived') THEN status
    ELSE 'draft'
  END AS status,
  coaches,
  experience_code,
  po_code,
  pricing_details,
  payment_page_id,
  estimated_costs,
  expected_revenue,
  expected_profit,
  paid_revenue,
  paid_profit,
  true AS active,
  notion_id,
  created_at,
  updated_at
FROM exp_experiences;

-- ────────────────────────────────────────────────────────────
-- 3. Add edition_id to dependent tables & populate from experience_id
-- ────────────────────────────────────────────────────────────

-- exp_bookings
ALTER TABLE exp_bookings ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE exp_bookings b
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = b.experience_id;

-- exp_packages
ALTER TABLE exp_packages ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE exp_packages p
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = p.experience_id;

-- exp_costs
ALTER TABLE exp_costs ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE exp_costs c
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = c.experience_id;

-- exp_hotel_rooms
ALTER TABLE exp_hotel_rooms ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE exp_hotel_rooms r
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = r.experience_id;

-- hours_log
ALTER TABLE hours_log ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE hours_log h
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = h.experience_id;

-- scenario_planner
ALTER TABLE scenario_planner ADD COLUMN IF NOT EXISTS edition_id UUID REFERENCES exp_editions(id) ON DELETE SET NULL;
UPDATE scenario_planner s
  SET edition_id = e.id
  FROM exp_editions e
  WHERE e.experience_id = s.experience_id;

-- ────────────────────────────────────────────────────────────
-- 4. Clean up exp_experiences — remove year-specific columns
--    Keep: id, title, slug, location, location_country, description,
--    highlights, hero_image, gallery, whats_included,
--    cancellation_policy, status (template-level), notion_id (set null),
--    created_at, updated_at, currency, timezone, hotel, airport_code,
--    whatsapp_group_link, notes, active_status, location_lat, location_lng,
--    total_fixed_costs (template-level fixed cost reference)
-- ────────────────────────────────────────────────────────────

-- Clear notion_id on templates (editions now carry it)
UPDATE exp_experiences SET notion_id = NULL;

-- Remove year-specific columns
ALTER TABLE exp_experiences
  DROP COLUMN IF EXISTS date_start,
  DROP COLUMN IF EXISTS date_end,
  DROP COLUMN IF EXISTS price_from,
  DROP COLUMN IF EXISTS price_to,
  DROP COLUMN IF EXISTS deposit,
  DROP COLUMN IF EXISTS max_spots,
  DROP COLUMN IF EXISTS spots_taken,
  DROP COLUMN IF EXISTS coaches,
  DROP COLUMN IF EXISTS experience_code,
  DROP COLUMN IF EXISTS po_code,
  DROP COLUMN IF EXISTS pricing_details,
  DROP COLUMN IF EXISTS payment_page_id,
  DROP COLUMN IF EXISTS estimated_costs,
  DROP COLUMN IF EXISTS expected_revenue,
  DROP COLUMN IF EXISTS expected_profit,
  DROP COLUMN IF EXISTS paid_revenue,
  DROP COLUMN IF EXISTS paid_profit,
  DROP COLUMN IF EXISTS spots_remaining;

-- Also drop the legacy price column (replaced by price_from/price_to on editions)
-- Keep it for now for backward compat — just note editions hold the canonical prices
-- ALTER TABLE exp_experiences DROP COLUMN IF EXISTS price;

-- ────────────────────────────────────────────────────────────
-- 5. RLS for exp_editions
-- ────────────────────────────────────────────────────────────
ALTER TABLE exp_editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON exp_editions FOR ALL USING (true);
CREATE POLICY "Allow read for authenticated" ON exp_editions FOR SELECT TO authenticated USING (true);
