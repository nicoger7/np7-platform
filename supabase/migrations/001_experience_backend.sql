-- ═══════════════════════════════════════
-- NP7 Platform — Experience Backend Expansion
-- Adds: bookings pipeline, hotel rooms, packages, components
-- Mirrors Notion data model (NP7 Pipeline + NP7 Hotel Rooms)
-- ═══════════════════════════════════════

-- ── Experience Packages ──
-- Each experience can have multiple packages (e.g. Pro, Beginner, Coaching Only)

CREATE TABLE IF NOT EXISTS exp_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experience_id UUID REFERENCES exp_experiences(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. "Pro Package", "Beginner Package"
  slug TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  deposit DECIMAL(10,2),
  includes TEXT[],                             -- what's included in this package
  max_spots INTEGER,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(experience_id, slug)
);

-- ── Experience Components ──
-- Building blocks that make up packages (coaching, meals, transfers, hotel, gear rental)

CREATE TABLE IF NOT EXISTS exp_components (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                          -- e.g. "Daily Coaching Session", "Airport Transfer"
  category TEXT NOT NULL CHECK (category IN (
    'coaching', 'accommodation', 'meals', 'transport', 'gear', 'activity', 'other'
  )),
  description TEXT,
  unit_cost DECIMAL(10,2),                     -- internal cost per unit
  is_global BOOLEAN DEFAULT true,              -- available across all experiences
  experience_id UUID REFERENCES exp_experiences(id) ON DELETE CASCADE,  -- NULL = global
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Package ↔ Component junction ──

CREATE TABLE IF NOT EXISTS exp_package_components (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID REFERENCES exp_packages(id) ON DELETE CASCADE,
  component_id UUID REFERENCES exp_components(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  UNIQUE(package_id, component_id)
);

-- ── Bookings (replaces exp_inquiries as the full pipeline) ──
-- Mirrors the Notion "NP7 Pipeline" database exactly

CREATE TABLE IF NOT EXISTS exp_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Core info
  name TEXT NOT NULL,                          -- booking title, e.g. "Jean-Marc — Bonaire 2026"
  experience_id UUID REFERENCES exp_experiences(id),
  package_id UUID REFERENCES exp_packages(id),
  contact_id UUID REFERENCES exp_contacts(id),

  -- Pipeline status (from Notion)
  status TEXT DEFAULT 'lead' CHECK (status IN (
    'lead',               -- new contact, not yet qualified
    'interested',         -- expressed interest
    'enquiring',          -- actively asking questions
    'ready_to_book',      -- ready to commit
    'payment_pending',    -- awaiting payment
    'downpayment_paid',   -- deposit received
    'create_invoice',     -- need to generate final invoice
    'paid',               -- fully paid
    'contact_by_phone',   -- needs phone follow-up
    'confirmed',          -- booking confirmed, all sorted
    'attended',           -- completed the experience
    'lost'                -- did not convert
  )),

  -- Travel info
  fly_in DATE,
  fly_out DATE,
  traveling_with TEXT,
  wa_group BOOLEAN DEFAULT false,              -- added to WhatsApp group

  -- Pricing
  agreed_price DECIMAL(10,2),

  -- Payment tracking
  downpayment_invoice_sent BOOLEAN DEFAULT false,
  downpayment_received BOOLEAN DEFAULT false,
  final_invoice_sent BOOLEAN DEFAULT false,
  final_invoice_due TEXT,                      -- free text for flexibility
  final_payment_received BOOLEAN DEFAULT false,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Booking Add-ons (extra items beyond the package) ──

CREATE TABLE IF NOT EXISTS exp_booking_addons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES exp_bookings(id) ON DELETE CASCADE,
  component_id UUID REFERENCES exp_components(id),
  label TEXT NOT NULL,                         -- display name
  price DECIMAL(10,2),
  notes TEXT
);

-- ── Booking Payments (individual payment records) ──

CREATE TABLE IF NOT EXISTS exp_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES exp_bookings(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('downpayment', 'final', 'partial', 'refund')),
  method TEXT,                                 -- bank_transfer, paypal, cash, etc.
  reference TEXT,                              -- invoice number or transaction ref
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Hotel Rooms (mirrors Notion "NP7 Hotel Rooms") ──

CREATE TABLE IF NOT EXISTS exp_hotel_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Room info
  name TEXT NOT NULL,                          -- display name
  hotel TEXT NOT NULL CHECK (hotel IN (
    'Sorobon', 'Wanapa', 'Playa Surf', 'Hotel Paradiso',
    'Alacati', 'REF', 'REF II'
  )),
  room_type TEXT NOT NULL,                     -- e.g. "BON-SOR-Ocean Front Beach House"
  room_number TEXT,

  -- Status
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'held')),

  -- Assignment
  booking_id UUID REFERENCES exp_bookings(id) ON DELETE SET NULL,
  experience_id UUID REFERENCES exp_experiences(id),
  check_in DATE,
  check_out DATE,
  transfer_need BOOLEAN DEFAULT false,
  partner_tag_along TEXT,
  comments TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Experience Settings (extra config per experience) ──
-- Extends exp_experiences with operational details

ALTER TABLE exp_experiences
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS hotel TEXT,                           -- default hotel for this experience
  ADD COLUMN IF NOT EXISTS airport_code TEXT,                    -- nearest airport (e.g. BON, ADB)
  ADD COLUMN IF NOT EXISTS whatsapp_group_link TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,                           -- internal notes
  ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

-- ── Enable RLS on new tables ──

ALTER TABLE exp_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_package_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_hotel_rooms ENABLE ROW LEVEL SECURITY;

-- ── Public read access for published packages ──

CREATE POLICY "Public can view packages of published experiences"
  ON exp_packages FOR SELECT
  USING (
    status = 'active' AND
    EXISTS (
      SELECT 1 FROM exp_experiences
      WHERE exp_experiences.id = exp_packages.experience_id
      AND exp_experiences.status = 'published'
    )
  );

-- ── Update the contacts table to support richer data ──

ALTER TABLE exp_contacts
  ADD COLUMN IF NOT EXISTS email2 TEXT,
  ADD COLUMN IF NOT EXISTS discipline TEXT,         -- Windsurf, Wingfoil, etc.
  ADD COLUMN IF NOT EXISTS level TEXT,              -- Beginner, Intermediate, Advanced, Pro
  ADD COLUMN IF NOT EXISTS source TEXT;             -- website, instagram, referral, etc.

-- Done!
