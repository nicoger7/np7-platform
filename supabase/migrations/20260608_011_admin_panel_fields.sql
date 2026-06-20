-- ============================================================
-- 20260608_011_admin_panel_fields.sql
-- Admin panel expansion: missing columns for Notion fields + new pages
-- ============================================================

-- ── exp_experiences ─────────────────────────────────────────
ALTER TABLE exp_experiences
  ADD COLUMN IF NOT EXISTS payment_page_id   TEXT,
  ADD COLUMN IF NOT EXISTS total_fixed_costs  NUMERIC,
  ADD COLUMN IF NOT EXISTS spots_remaining    INTEGER;

-- ── exp_packages ────────────────────────────────────────────
ALTER TABLE exp_packages
  ADD COLUMN IF NOT EXISTS category TEXT; -- pro / beginner / mixed

-- ── exp_costs ───────────────────────────────────────────────
ALTER TABLE exp_costs
  ADD COLUMN IF NOT EXISTS actual_amount NUMERIC;

-- ── contacts ────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS level_notes TEXT;

-- ── team_members ────────────────────────────────────────────
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── todos ───────────────────────────────────────────────────
ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

-- ── scenario_planner ────────────────────────────────────────
ALTER TABLE scenario_planner
  ADD COLUMN IF NOT EXISTS assumptions       TEXT,
  ADD COLUMN IF NOT EXISTS projected_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS projected_costs   NUMERIC,
  ADD COLUMN IF NOT EXISTS projected_profit  NUMERIC;

-- ── email_templates ─────────────────────────────────────────
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS body          TEXT,
  ADD COLUMN IF NOT EXISTS trigger_stage TEXT,
  ADD COLUMN IF NOT EXISTS active        BOOLEAN DEFAULT TRUE;

-- ── task_rules ──────────────────────────────────────────────
ALTER TABLE task_rules
  ADD COLUMN IF NOT EXISTS trigger      TEXT,
  ADD COLUMN IF NOT EXISTS template     TEXT,
  ADD COLUMN IF NOT EXISTS experience_id UUID REFERENCES exp_experiences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active        BOOLEAN DEFAULT TRUE;

-- ── pipeline_rules ──────────────────────────────────────────
ALTER TABLE pipeline_rules
  ADD COLUMN IF NOT EXISTS active  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS action  TEXT;
