-- Migration 004: Expand exp_payments with Notion fields
-- Already has: booking_id, amount, type, method, reference, received_at, notes, created_at
-- Missing: contact, vendor, experience links + direction, invoice_type, status, date

ALTER TABLE exp_payments
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experience_id UUID REFERENCES exp_experiences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction TEXT CHECK (direction IN ('revenue', 'cost')),
  ADD COLUMN IF NOT EXISTS invoice_type TEXT CHECK (invoice_type IN ('down_payment', 'final_payment', 'additional_service')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS unmatched BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
