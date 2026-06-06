-- ═══════════════════════════════════════
-- NP7 Platform — Database Setup
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════

-- ── Experience tables ──

CREATE TABLE exp_experiences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  location TEXT NOT NULL,
  date_start DATE,
  date_end DATE,
  price DECIMAL(10,2),
  deposit DECIMAL(10,2),
  max_spots INTEGER DEFAULT 12,
  spots_taken INTEGER DEFAULT 0,
  description TEXT,
  whats_included TEXT[],
  hero_image TEXT,
  gallery TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exp_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exp_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experience_id UUID REFERENCES exp_experiences(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'booked', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exp_blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT,
  cover_image TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exp_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Hardware tables ──

CREATE TABLE hw_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('boards', 'foils', 'accessories')),
  description TEXT,
  specs JSONB,
  price DECIMAL(10,2),
  images TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hw_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES hw_products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  stock_count INTEGER DEFAULT 0,
  reserved_count INTEGER DEFAULT 0
);

CREATE TABLE hw_inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES hw_products(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'sold', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hw_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Shared tables ──

CREATE TABLE team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Enable Row Level Security ──

ALTER TABLE exp_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exp_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hw_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE hw_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE hw_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hw_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- ── Public read access for published content ──

CREATE POLICY "Public can view published experiences"
  ON exp_experiences FOR SELECT
  USING (status = 'published');

CREATE POLICY "Public can view published blog posts"
  ON exp_blog_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Public can view pages"
  ON exp_pages FOR SELECT
  USING (true);

CREATE POLICY "Public can view published products"
  ON hw_products FOR SELECT
  USING (status = 'published');

CREATE POLICY "Public can view variants of published products"
  ON hw_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM hw_products
      WHERE hw_products.id = hw_variants.product_id
      AND hw_products.status = 'published'
    )
  );

-- ── Public can submit inquiries ──

CREATE POLICY "Public can submit experience inquiries"
  ON exp_inquiries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can submit hardware inquiries"
  ON hw_inquiries FOR INSERT
  WITH CHECK (true);

-- ── Seed some sample experiences ──

INSERT INTO exp_experiences (title, slug, location, date_start, date_end, price, deposit, max_spots, spots_taken, description, hero_image, status) VALUES
(
  'NP7 Lake Garda',
  'np7-lake-garda-2026',
  'Lake Garda, Italy',
  '2026-05-26',
  '2026-05-31',
  1490,
  490,
  12,
  8,
  'Six days riding the Ora wind on one of Europe''s most scenic lakes. Daily coaching, video analysis, and the best pizza you''ve ever had.',
  'https://surfcenter-experience.com/wp-content/uploads/2025/03/final-final-fina-768x432.jpg',
  'published'
),
(
  'NP7 Alacati',
  'np7-alacati-2026',
  'Alacati, Turkey',
  '2026-08-17',
  '2026-08-23',
  1890,
  590,
  10,
  4,
  'Meltemi wind, flat water, and a week of pure freestyle and freeride. One of the world''s best windsurfing spots.',
  'https://surfcenter-experience.com/wp-content/uploads/2025/11/Tenerife-3-1024x576.jpg',
  'published'
),
(
  'NP7 Bonaire Week I',
  'np7-bonaire-week-1-2026',
  'Bonaire, Caribbean',
  '2026-11-30',
  '2026-12-06',
  2890,
  890,
  8,
  5,
  'Trade winds, warm water, and the most consistent spot in the Caribbean. Flat water paradise for foiling and freestyle.',
  'https://surfcenter-experience.com/wp-content/uploads/2025/11/54546389898_3793d23e96_h.jpg',
  'published'
),
(
  'NP7 Bonaire Week II',
  'np7-bonaire-week-2-2026',
  'Bonaire, Caribbean',
  '2026-12-07',
  '2026-12-13',
  2890,
  890,
  8,
  3,
  'Week two in Bonaire. Same magic spot, fresh group. Perfect for foil progression and warm-water sailing.',
  'https://surfcenter-experience.com/wp-content/uploads/2025/11/54546389898_3793d23e96_h.jpg',
  'published'
),
(
  'NP7 Madagascar',
  'np7-madagascar-2026',
  'Madagascar',
  '2026-06-26',
  '2026-07-07',
  3490,
  990,
  6,
  2,
  'The ultimate adventure trip. Remote spots, empty waves, and the kind of wind you dream about. Limited to 6 riders.',
  'https://surfcenter-experience.com/wp-content/uploads/2025/05/54566254695_754d7b8493_o-scaled-e1756488405315-1024x608.jpg',
  'published'
);

-- Done!
