-- Migration 005: Experience cost items (budgeting per experience)

CREATE TABLE IF NOT EXISTS exp_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experience_id UUID NOT NULL REFERENCES exp_experiences(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  estimated_amount DECIMAL(10,2),
  status TEXT DEFAULT 'estimate' CHECK (status IN ('confirmed', 'estimate', 'cancelled', 'unlisted')),
  date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exp_costs ENABLE ROW LEVEL SECURITY;
