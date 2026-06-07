-- Migration 001: Unify contacts
-- Rename exp_contacts → contacts (preserves FKs automatically in Postgres)
-- Add Notion-level fields, drop hw_contacts

ALTER TABLE exp_contacts RENAME TO contacts;

-- Add all Notion contact fields that are missing
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS diet_allergies TEXT,
  ADD COLUMN IF NOT EXISTS tshirt_size TEXT CHECK (tshirt_size IN ('xs', 's', 'm', 'l', 'xl', 'xxl')),
  ADD COLUMN IF NOT EXISTS experience_locations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interested_products TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS chatwoot_contact_id TEXT;

-- discipline exists as TEXT, but Notion has it as multi_select → make it TEXT[]
-- Can't easily change type if there's data, so add a new array column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS disciplines TEXT[] DEFAULT '{}';

-- level exists as TEXT (already fine for single select)
-- source exists (keep it)
-- email2 exists (keep it)

-- Drop hw_contacts (replaced by unified contacts)
DROP TABLE IF EXISTS hw_contacts CASCADE;
