-- Migration 002: Add missing Notion fields to exp_experiences
-- Already has: currency, timezone, hotel, airport_code, whatsapp_group_link, notes, cancellation_policy

ALTER TABLE exp_experiences
  ADD COLUMN IF NOT EXISTS coaches TEXT,
  ADD COLUMN IF NOT EXISTS experience_code TEXT,
  ADD COLUMN IF NOT EXISTS po_code TEXT,
  ADD COLUMN IF NOT EXISTS price_from DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS price_to DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS pricing_details TEXT,
  ADD COLUMN IF NOT EXISTS estimated_costs DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS expected_revenue DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS expected_profit DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS paid_revenue DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS paid_profit DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS location_lat DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS location_lng DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS active_status TEXT DEFAULT 'in_planning'
    CHECK (active_status IN ('published', 'private', 'in_planning'));
