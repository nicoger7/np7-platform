-- ═══════════════════════════════════════
-- NP7 Platform — Notion Data Migration
-- Migrates Pipeline + Hotel Rooms from Notion → Supabase
-- Source: NP7 Pipeline (32c992eb-86b0-818d-8e86-ddeac585bdb0)
-- Source: NP7 Hotel Rooms (359992eb-86b0-815b-9b84-f3c7c4b68686)
-- Run AFTER 001_experience_backend.sql
-- ═══════════════════════════════════════

-- ── Step 1: Add missing experiences not in original seed ──

INSERT INTO exp_experiences (title, slug, location, date_start, date_end, price, deposit, max_spots, spots_taken, description, status, hotel, airport_code)
VALUES
(
  'NP7 Tenerife',
  'np7-tenerife-2026',
  'Tenerife, Spain',
  '2026-03-15',
  '2026-03-22',
  3120,
  1560,
  8,
  8,
  'Wave and freeride clinic on Tenerife. Atlantic swells and consistent trade winds.',
  'published',
  NULL,
  'TFS'
),
(
  'NP7 Bonaire Week III',
  'np7-bonaire-week-3-2026',
  'Bonaire, Caribbean',
  '2026-12-14',
  '2026-12-20',
  2890,
  890,
  8,
  1,
  'Week three in Bonaire. Same magic spot, small intimate group. Perfect for advanced riders.',
  'published',
  'Sorobon',
  'BON'
),
(
  'NP7 Bonaire WindWeek June',
  'np7-bonaire-windweek-june-2026',
  'Bonaire, Caribbean',
  '2026-06-15',
  '2026-06-21',
  2890,
  890,
  8,
  0,
  'Summer Bonaire WindWeek. CANCELLED.',
  'archived',
  'Sorobon',
  'BON'
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing experiences with hotel + airport info
UPDATE exp_experiences SET hotel = 'Hotel Paradiso', airport_code = 'VRN' WHERE slug = 'np7-lake-garda-2026';
UPDATE exp_experiences SET hotel = 'REF', airport_code = 'ADB' WHERE slug = 'np7-alacati-2026';
UPDATE exp_experiences SET hotel = 'Sorobon', airport_code = 'BON' WHERE slug = 'np7-bonaire-week-1-2026';
UPDATE exp_experiences SET hotel = 'Sorobon', airport_code = 'BON' WHERE slug = 'np7-bonaire-week-2-2026';

-- ── Step 2: Insert contacts (extracted from booking names) ──

INSERT INTO exp_contacts (name, email, notes) VALUES
  ('Thomas Jönsson', NULL, 'Traveling with Mia Hogenius'),
  ('Mia Hogenius', NULL, 'Traveling with Thomas Jönsson'),
  ('Sibe Wassenaar', NULL, 'Want to learn using the hip harness'),
  ('Brad Williams', NULL, NULL),
  ('Miguel Gubiz', NULL, 'Sunset Room - Lake Garda'),
  ('Marc Vos', NULL, 'NP7 Experience - ADVANCED - All Incl. - SOROBON BEACH RESORT Garden view beach studio'),
  ('Jean-Marc Alberola', NULL, NULL),
  ('Marc Wullings', NULL, 'All Incl. Single Room | M | Freeride/Wave | DOB: 1970-01-21 | Harness & Footstraps'),
  ('Raimundo Sala Albert', NULL, 'Bonaire WindWeek June - cancelled'),
  ('Jose Castor Garcia', NULL, 'Bonaire WindWeek June - cancelled'),
  ('Jan Brouns', NULL, 'Bonaire WindWeek June - cancelled'),
  ('Elena Topolskaia', NULL, 'Tag-along, not windsurfing - traveling with Marc Vos')
ON CONFLICT DO NOTHING;

-- ── Step 3: Insert bookings ──
-- Uses subqueries to reference experiences and contacts by name/slug

-- Thomas Jönsson — Alacati 2026 (Paid)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Thomas Jönsson — Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Thomas Jönsson' LIMIT 1),
  'paid',
  '2026-08-17', '2026-08-23',
  'Mia Hogenius (traveling together)',
  false,
  5350.00,
  true, true, true, true,
  NULL,
  '2026-03-23T04:54:00Z'
);

-- Mia Hogenius — Alacati 2026 (Payment Pending)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Mia Hogenius — Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Mia Hogenius' LIMIT 1),
  'payment_pending',
  '2026-08-17', '2026-08-23',
  'Thomas Jönsson (traveling together)',
  false,
  0.00,
  true, true, false, false,
  'Paid from Thomas Jonsson',
  '2026-03-23T04:55:00Z'
);

-- Sibe Wassenaar — Alacati 2026 (Paid)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Sibe Wassenaar — Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Sibe Wassenaar' LIMIT 1),
  'paid',
  '2026-08-16', '2026-08-23',
  NULL,
  false,
  5175.00,
  false, true, true, true,
  'Want to learn using the hip harness as I am used to old fashioned sitting harness :)',
  '2026-05-07T17:00:00Z'
);

-- Brad Williams - Alacati 2026 (Payment Pending)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Brad Williams - Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Brad Williams' LIMIT 1),
  'payment_pending',
  '2026-08-17', '2026-08-23',
  NULL,
  false,
  2900.00,
  false, false, false, false,
  NULL,
  '2026-05-17T14:22:00Z'
);

-- Miguel Gubiz - Lake Garda 2026 (Attended)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Miguel Gubiz - Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Miguel Gubiz' LIMIT 1),
  'attended',
  '2026-05-26', '2026-05-31',
  NULL,
  false,
  3700.00,
  false, false, false, false,
  'Sunset Room',
  '2026-05-06T10:25:00Z'
);

-- Marc Vos — Lake Garda 2026 (Attended)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Marc Vos — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Marc Vos' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  false,
  3625.00,
  true, true, true, true,
  'NP7 Experience - ADVANCED - All Incl. - SOROBON BEACH RESORT Garden view beach studio (5.550,00€)',
  '2026-03-23T04:55:00Z'
);

-- Marc Vos — Bonaire 2026 - Week III (Downpayment Paid)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Marc Vos — Bonaire 2026 - Week III',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-3-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Marc Vos' LIMIT 1),
  'downpayment_paid',
  '2026-12-14', '2026-12-20',
  'Elena Topolskaia (tag-along, not windsurfing)',
  false,
  5696.00,
  true, true, false, false,
  'NP7 Experience - ADVANCED - All Incl. - SOROBON BEACH RESORT Garden view beach studio (5.550,00€)',
  '2026-03-23T04:55:00Z'
);

-- Jean-Marc Alberola - Bonaire 2026 - Week I (Confirmed)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Jean-Marc Alberola - Bonaire 2026 - Week I',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-1-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Jean-Marc Alberola' LIMIT 1),
  'confirmed',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  NULL,
  '2026-05-17T14:16:00Z'
);

-- Jean-Marc Alberola — Bonaire 2026 - NP7 WindWeek (Lost)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Jean-Marc Alberola — Bonaire 2026 - NP7 WindWeek',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-windweek-june-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Jean-Marc Alberola' LIMIT 1),
  'lost',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  'Event cancelled — Bonaire WindWeek June 2026 cancelled.',
  '2026-04-20T21:09:00Z'
);

-- Marc Wullings — Tenerife 2026 (Attended)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Marc Wullings — Tenerife 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-tenerife-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Marc Wullings' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  true,
  NULL,
  true, true, true, true,
  'All Incl. Single Room | M | Freeride/Wave | DOB: 1970-01-21 | Harness & Footstraps | Lunch: Yes | Total: €3,120 | Down: €1,560',
  '2026-03-23T04:54:00Z'
);

-- Raimundo Sala Albert — Bonaire 2026 - NP7 WindWeek (Lost)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Raimundo Sala Albert — Bonaire 2026 - NP7 WindWeek',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-windweek-june-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Raimundo Sala Albert' LIMIT 1),
  'lost',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  'Event cancelled — Bonaire WindWeek June 2026 cancelled.',
  '2026-04-20T00:00:00Z'
);

-- Jose Castor Garcia — Bonaire 2026 - NP7 WindWeek (Lost)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Jose Castor Garcia — Bonaire 2026 - NP7 WindWeek',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-windweek-june-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Jose Castor Garcia' LIMIT 1),
  'lost',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  'Event cancelled — Bonaire WindWeek June 2026 cancelled.',
  '2026-04-20T00:00:00Z'
);

-- Jan Brouns — Bonaire 2026 - NP7 WindWeek (Lost)
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, notes, created_at)
VALUES (
  'Jan Brouns — Bonaire 2026 - NP7 WindWeek',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-windweek-june-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Jan Brouns' LIMIT 1),
  'lost',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  'Event cancelled — Bonaire WindWeek June 2026 cancelled.',
  '2026-04-20T00:00:00Z'
);

-- ── Step 4: Insert Hotel Rooms ──

-- Lake Garda — Hotel Paradiso (Sunset Rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, booking_id, partner_tag_along, comments)
VALUES
(
  'Sunset Room 1',
  'Hotel Paradiso',
  'GAR-PAR-Sunset Room',
  '1',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  NULL,
  'Claudia Balmas',
  NULL
),
(
  'Sunset Room 2',
  'Hotel Paradiso',
  'GAR-PAR-Sunset Room',
  '2',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  NULL,
  NULL,
  NULL
),
(
  'Sunset Room 3',
  'Hotel Paradiso',
  'GAR-PAR-Sunset Room',
  '3',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_bookings WHERE name = 'Miguel Gubiz - Lake Garda 2026' LIMIT 1),
  NULL,
  NULL
);

-- Lake Garda — Hotel Paradiso (Lake View Rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, booking_id, partner_tag_along, comments)
VALUES
(
  'Lake View Room 1',
  'Hotel Paradiso',
  'GAR-PAR-Lake View Room',
  '1',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  NULL,
  'Andrea Axani',
  NULL
),
(
  'Lake View Room 2',
  'Hotel Paradiso',
  'GAR-PAR-Lake View Room',
  '2',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  NULL,
  'Liam Heisler (12y, son)',
  'Room type uncertain - price (4430) suggests Sunset but all Sunset rooms taken. Verify with Nico.'
),
(
  'Lake View Room 3',
  'Hotel Paradiso',
  'GAR-PAR-Lake View Room',
  '3',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  NULL,
  NULL,
  NULL
);

-- Alacati — REF (Superior Rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, booking_id, partner_tag_along, comments)
VALUES
(
  'Superior Room 1',
  'REF',
  'TUR-REF-Superior Room',
  '1',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
),
(
  'Superior Room 2',
  'REF',
  'TUR-REF-Superior Room',
  '2',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
);

-- Alacati — REF (Standard Rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, booking_id, partner_tag_along, comments)
VALUES
(
  'Standard Room 1',
  'REF',
  'TUR-REF-Standard Room',
  '1',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_bookings WHERE name = 'Thomas Jönsson — Alacati 2026' LIMIT 1),
  NULL,
  'Thomas Jönsson + Mia Hogenius'
),
(
  'Standard Room 2',
  'REF',
  'TUR-REF-Standard Room',
  '2',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
),
(
  'Standard Room 3',
  'REF',
  'TUR-REF-Standard Room',
  '3',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
),
(
  'Standard Room 4',
  'REF',
  'TUR-REF-Standard Room',
  '4',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
),
(
  'Standard Room 5',
  'REF',
  'TUR-REF-Standard Room',
  '5',
  'available',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  NULL,
  NULL
);

-- Alacati — REF II
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, booking_id, check_in, check_out, partner_tag_along, comments)
VALUES
(
  'Room 1',
  'REF II',
  'TUR-REF+-Standard Room',
  '1',
  'assigned',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  NULL,
  '2026-08-16',
  '2026-08-23',
  NULL,
  'Room name TBD'
);

-- ── Step 5: Insert payment records for fully paid bookings ──

-- Thomas Jönsson payment (full €5,350)
INSERT INTO exp_payments (booking_id, amount, type, method, reference, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Thomas Jönsson — Alacati 2026' LIMIT 1),
  5350.00,
  'final',
  'bank_transfer',
  NULL,
  '2026-05-01T00:00:00Z',
  'Full payment received (includes Mia Hogenius portion)'
);

-- Sibe Wassenaar payment (full €5,175)
INSERT INTO exp_payments (booking_id, amount, type, method, reference, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Sibe Wassenaar — Alacati 2026' LIMIT 1),
  5175.00,
  'final',
  'bank_transfer',
  NULL,
  '2026-05-20T00:00:00Z',
  'Full payment received'
);

-- Marc Vos — Lake Garda payment (full €3,625)
INSERT INTO exp_payments (booking_id, amount, type, method, reference, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Marc Vos — Lake Garda 2026' LIMIT 1),
  3625.00,
  'final',
  'bank_transfer',
  NULL,
  '2026-05-01T00:00:00Z',
  'Full payment received'
);

-- Marc Vos — Bonaire Week III downpayment
INSERT INTO exp_payments (booking_id, amount, type, method, reference, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Marc Vos — Bonaire 2026 - Week III' LIMIT 1),
  890.00,
  'downpayment',
  'bank_transfer',
  NULL,
  '2026-04-15T00:00:00Z',
  'Downpayment received'
);

-- Done! All Notion Pipeline and Hotel Rooms data migrated.
