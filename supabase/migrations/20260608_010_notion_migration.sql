-- Migration: Add notion_id to existing tables + create new tables for Notion data migration
-- Generated: 2026-06-08

-- ────────────────────────────────────────────
-- 1. Add notion_id to all existing tables
-- ────────────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_notion_id_idx ON contacts(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_experiences ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_experiences_notion_id_idx ON exp_experiences(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS team_members_notion_id_idx ON team_members(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS vendors_notion_id_idx ON vendors(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_components_notion_id_idx ON exp_components(notion_id) WHERE notion_id IS NOT NULL;

-- Extra columns for exp_components (from Notion)
ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS sell_price numeric;
ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS addon_available boolean DEFAULT false;
ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE exp_components ADD COLUMN IF NOT EXISTS year text[];

ALTER TABLE exp_packages ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_packages_notion_id_idx ON exp_packages(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_bookings ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_bookings_notion_id_idx ON exp_bookings(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_costs ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_costs_notion_id_idx ON exp_costs(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_payments ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_payments_notion_id_idx ON exp_payments(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE exp_hotel_rooms ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS exp_hotel_rooms_notion_id_idx ON exp_hotel_rooms(notion_id) WHERE notion_id IS NOT NULL;

ALTER TABLE hours_log ADD COLUMN IF NOT EXISTS notion_id text;
CREATE UNIQUE INDEX IF NOT EXISTS hours_log_notion_id_idx ON hours_log(notion_id) WHERE notion_id IS NOT NULL;

-- ────────────────────────────────────────────
-- 2. Create new tables
-- ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS todos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    name text NOT NULL,
    status text,
    due_date date,
    assignee text,
    experience_id uuid REFERENCES exp_experiences(id) ON DELETE SET NULL,
    task_rule_id uuid,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_planner (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    name text NOT NULL,
    experience_id uuid REFERENCES exp_experiences(id) ON DELETE SET NULL,
    num_beginner integer DEFAULT 0,
    num_pro integer DEFAULT 0,
    num_mixed integer DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    name text NOT NULL,
    type text,
    status text,
    subject_line text,
    language text[],
    experience_id uuid REFERENCES exp_experiences(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    name text NOT NULL,
    assignee text,
    days_before_start integer,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    name text NOT NULL,
    type text,
    status text,
    trigger text,
    days_after_trigger integer,
    subject_line text,
    language text[],
    stop_if text[],
    tags text[],
    experience_id uuid REFERENCES exp_experiences(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notion_id text UNIQUE,
    entry text NOT NULL,
    field text,
    old_value text,
    new_value text,
    timestamp timestamptz,
    source text,
    reason text,
    booking_id uuid REFERENCES exp_bookings(id) ON DELETE SET NULL,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Update task_rules FK in todos now that task_rules exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'todos_task_rule_id_fkey'
    ) THEN
        ALTER TABLE todos ADD CONSTRAINT todos_task_rule_id_fkey
            FOREIGN KEY (task_rule_id) REFERENCES task_rules(id) ON DELETE SET NULL;
    END IF;
END $$;
