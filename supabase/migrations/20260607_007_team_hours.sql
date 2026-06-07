-- Migration 007: Expand team_members + hours log

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS rate_per_hour DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Expand role options (keep existing admin/editor, add coach/operations)
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('admin', 'editor', 'coach', 'operations'));

CREATE TABLE IF NOT EXISTS hours_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  experience_id UUID REFERENCES exp_experiences(id) ON DELETE SET NULL,
  entry TEXT NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  category TEXT CHECK (category IN (
    'coaching', 'preparation', 'on_water', 'admin',
    'travel', 'marketing', 'general'
  )),
  date DATE NOT NULL,
  is_general BOOLEAN DEFAULT false,
  processed_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hours_log ENABLE ROW LEVEL SECURITY;
