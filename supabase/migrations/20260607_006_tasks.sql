-- Migration 006: Task templates + experience tasks

CREATE TABLE IF NOT EXISTS exp_task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  default_assignee TEXT CHECK (default_assignee IN ('nico', 'simona', 'both')),
  days_before_start INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exp_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES exp_bookings(id) ON DELETE CASCADE,
  experience_id UUID REFERENCES exp_experiences(id) ON DELETE CASCADE,
  template_id UUID REFERENCES exp_task_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  assignee TEXT CHECK (assignee IN ('nico', 'simona', 'both')),
  due_date DATE,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exp_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_tasks ENABLE ROW LEVEL SECURITY;
