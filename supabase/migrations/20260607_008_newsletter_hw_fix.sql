-- Migration 008: Newsletter subscribers + fix hw_products category

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT CHECK (source IN ('experience', 'hardware', 'landing')),
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can subscribe to newsletter"
  ON newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- Fix hw_products category to include fins
ALTER TABLE hw_products DROP CONSTRAINT IF EXISTS hw_products_category_check;
ALTER TABLE hw_products
  ADD CONSTRAINT hw_products_category_check
  CHECK (category IN ('boards', 'fins', 'foils', 'accessories'));

-- Add contact_id to hw_inquiries (link to unified contacts)
ALTER TABLE hw_inquiries
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
