-- ═══════════════════════════════════════
-- NP7 Platform — Complete Notion Data Migration (Part 2)
-- Adds remaining 17 pipeline entries + 34 hotel rooms from Notion
-- ═══════════════════════════════════════

-- ── New Contacts ──
INSERT INTO exp_contacts (name, email, notes) VALUES
  ('Adam Axani', NULL, 'Lake View - Double room shared with the mother'),
  ('Anastas Spiro', NULL, 'NP7 Experience – All Inclusive - Garden View - Single Room (€3.090,00)'),
  ('Ben Capper', NULL, NULL),
  ('Florian', NULL, NULL),
  ('Frank Nöthen', NULL, 'Lake View Balcony - Double room (€3.450,00)'),
  ('Hans Reiter', NULL, 'NP7 with sunset'),
  ('Heisler Bernhard', NULL, 'Bernhard is bringing his son Liam to Lake Garda 2026. Son is not a windsurfer and will primarily do swimming/SUPing. Bernhard may try windsurfing with old personal gear. Arrival expected very soon (me'),
  ('Julius Stelzer', NULL, 'NP7 Experience - Beginner '),
  ('Leendert Hubregtse', NULL, '1. is airport shuttle included in the arrangement?'),
  ('Michael Bongar', NULL, 'NP7 Experience - PRO - All Inclusive - Standard Room (3950,00,-)'),
  ('Miguel Arrigoni', NULL, 'NP7 with sunset'),
  ('Nils Carstens', NULL, 'NP7 Experience – All Inclusive - Garden View Room (€3.350,00)'),
  ('Patrick Sojecki', NULL, 'Lake View Balcony - Double room (€3.450,00)'),
  ('Peter ten Veldhuis', NULL, 'NP7 Experience - ADVANCED - All Incl. - WANAPA Double Deluxe Patio (3.990,00€)'),
  ('Sven Heinsohn', NULL, NULL)
ON CONFLICT DO NOTHING;

-- ── New Bookings ──
INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Adam Axani - Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Adam Axani' LIMIT 1),
  'attended',
  '2026-05-26', '2026-05-31',
  'Kevin Axani (the father) and the mother, but not taking part of the experience',
  false,
  3915,
  false, true, true, true,
  NULL,
  'Lake View - Double room shared with the mother',
  '2026-05-03T12:51:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Anastas Spiro — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Anastas Spiro' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  false,
  3215,
  true, true, true, true,
  '—',
  'NP7 Experience – All Inclusive - Garden View - Single Room (€3.090,00)',
  '2026-03-23T04:54:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Ben Capper - Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Ben Capper' LIMIT 1),
  'paid',
  '2026-08-17', '2026-08-23',
  NULL,
  false,
  4700,
  false, false, false, false,
  NULL,
  NULL,
  '2026-05-16T11:15:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Florian - Bonaire 2026 - Week I',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-1-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Florian' LIMIT 1),
  'confirmed',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  NULL,
  NULL,
  '2026-05-26T12:00:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Frank Nöthen — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Frank Nöthen' LIMIT 1),
  'attended',
  '2026-05-21', '2026-06-01',
  NULL,
  false,
  4835,
  true, true, true, true,
  '—',
  'Lake View Balcony - Double room (€3.450,00)',
  '2026-03-23T04:54:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Hans Reiter — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Hans Reiter' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  false,
  NULL,
  true, true, true, true,
  '—',
  'NP7 with sunset',
  '2026-03-23T04:54:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Heisler Bernhard — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Heisler Bernhard' LIMIT 1),
  'attended',
  NULL, NULL,
  'Liam Heisler (12 years old, tag-along), Liam Heisler (12 years old)',
  false,
  4430,
  true, true, true, true,
  '—',
  'Bernhard is bringing his son Liam to Lake Garda 2026. Son is not a windsurfer and will primarily do swimming/SUPing. Bernhard may try windsurfing with old personal gear. Arrival expected very soon (message dated 31 March 2026).',
  '2026-03-23T04:55:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Julius Stelzer - Bonaire 2026 - Week II',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-2-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Julius Stelzer' LIMIT 1),
  'downpayment_paid',
  '2026-12-05', '2026-12-13',
  'David Stelzer',
  false,
  6164.2,
  true, true, false, false,
  NULL,
  'NP7 Experience - Beginner ',
  '2026-04-16T20:05:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Leendert Hubregtse - Bonaire 2026 - Week I',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-1-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Leendert Hubregtse' LIMIT 1),
  'confirmed',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  NULL,
  '1. is airport shuttle included in the arrangement?',
  '2026-05-27T14:00:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Michael Bongar — Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Michael Bongar' LIMIT 1),
  'paid',
  '2026-08-16', '2026-08-23',
  NULL,
  false,
  4100,
  true, true, true, true,
  '❗',
  'NP7 Experience - PRO - All Inclusive - Standard Room (3950,00,-)',
  '2026-03-23T04:55:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Miguel Arrigoni — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Miguel Arrigoni' LIMIT 1),
  'attended',
  '2026-05-25', '2026-06-01',
  'Claudia Balmas (spouse)',
  false,
  4882,
  true, true, true, true,
  '—',
  'NP7 with sunset',
  '2026-03-23T04:54:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Nils Carstens — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Nils Carstens' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  false,
  3415,
  true, true, true, true,
  NULL,
  'NP7 Experience – All Inclusive - Garden View Room (€3.350,00)',
  '2026-03-23T04:55:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Patrick Sojecki — Lake Garda 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-lake-garda-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Patrick Sojecki' LIMIT 1),
  'attended',
  NULL, NULL,
  NULL,
  false,
  4075,
  true, true, true, true,
  NULL,
  'Lake View Balcony - Double room (€3.450,00)',
  '2026-03-23T04:54:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Peter ten Veldhuis — Alacati 2026',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-alacati-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Peter ten Veldhuis' LIMIT 1),
  'paid',
  '2026-08-15', '2026-08-23',
  NULL,
  false,
  4250,
  true, true, true, true,
  '❗',
  'NP7 Experience - ADVANCED - All Incl. - WANAPA Double Deluxe Patio (3.990,00€)',
  '2026-03-23T04:55:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Sven Heinsohn - Bonaire 2026 - Week I',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-1-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Sven Heinsohn' LIMIT 1),
  'confirmed',
  NULL, NULL,
  NULL,
  false,
  NULL,
  false, false, false, false,
  NULL,
  NULL,
  '2026-05-27T17:00:00.000Z'
);

INSERT INTO exp_bookings (name, experience_id, contact_id, status, fly_in, fly_out, traveling_with, wa_group, agreed_price, downpayment_invoice_sent, downpayment_received, final_invoice_sent, final_payment_received, final_invoice_due, notes, created_at)
VALUES (
  'Thomas Jönsson — Bonaire 2026 - Week II',
  (SELECT id FROM exp_experiences WHERE slug = 'np7-bonaire-week-2-2026'),
  (SELECT id FROM exp_contacts WHERE name = 'Thomas Jönsson' LIMIT 1),
  'downpayment_paid',
  '2026-12-07', '2026-12-13',
  'Mia Hogenius (traveling together)',
  false,
  4260,
  true, true, false, false,
  '—',
  'NP7 Experience - ADVANCED - All Incl. - WANAPA Double Deluxe with Balcony (4.150,00€)',
  '2026-03-23T04:54:00.000Z'
);

-- ── Payment records for fully paid bookings ──
INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Adam Axani - Lake Garda 2026' LIMIT 1),
  3915, 'final', 'bank_transfer', '2026-05-03T12:51:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Anastas Spiro — Lake Garda 2026' LIMIT 1),
  3215, 'final', 'bank_transfer', '2026-03-23T04:54:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Frank Nöthen — Lake Garda 2026' LIMIT 1),
  4835, 'final', 'bank_transfer', '2026-03-23T04:54:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Heisler Bernhard — Lake Garda 2026' LIMIT 1),
  4430, 'final', 'bank_transfer', '2026-03-23T04:55:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Julius Stelzer - Bonaire 2026 - Week II' LIMIT 1),
  890.00, 'downpayment', 'bank_transfer', '2026-04-16T20:05:00.000Z', 'Downpayment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Michael Bongar — Alacati 2026' LIMIT 1),
  4100, 'final', 'bank_transfer', '2026-03-23T04:55:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Miguel Arrigoni — Lake Garda 2026' LIMIT 1),
  4882, 'final', 'bank_transfer', '2026-03-23T04:54:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Nils Carstens — Lake Garda 2026' LIMIT 1),
  3415, 'final', 'bank_transfer', '2026-03-23T04:55:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Patrick Sojecki — Lake Garda 2026' LIMIT 1),
  4075, 'final', 'bank_transfer', '2026-03-23T04:54:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Peter ten Veldhuis — Alacati 2026' LIMIT 1),
  4250, 'final', 'bank_transfer', '2026-03-23T04:55:00.000Z', 'Full payment received'
);

INSERT INTO exp_payments (booking_id, amount, type, method, received_at, notes)
VALUES (
  (SELECT id FROM exp_bookings WHERE name = 'Thomas Jönsson — Bonaire 2026 - Week II' LIMIT 1),
  890.00, 'downpayment', 'bank_transfer', '2026-03-23T04:54:00.000Z', 'Downpayment received'
);

-- ── Remaining Hotel Rooms from Notion ──

-- Sorobon (22 rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 1', 'Sorobon', 'BON-SOR-Garden View Beach House', '1', 'assigned', NULL, '2026-12-05', '2026-12-16', false, 'Niklas', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 1', 'Sorobon', 'BON-SOR-Garden View Beach House', '1', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 2', 'Sorobon', 'BON-SOR-Garden View Beach House', '2', 'assigned', NULL, '2026-12-01', '2026-12-15', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 2', 'Sorobon', 'BON-SOR-Garden View Beach House', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 3', 'Sorobon', 'BON-SOR-Garden View Beach House', '3', 'available', NULL, NULL, NULL, false, 'Mia ', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Beach House 3', 'Sorobon', 'BON-SOR-Garden View Beach House', '3', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Studio 1', 'Sorobon', 'BON-SOR-Garden View Studio', '1', 'assigned', NULL, '2026-12-07', '2026-12-13', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Studio 1', 'Sorobon', 'BON-SOR-Garden View Studio', '1', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Studio 2', 'Sorobon', 'BON-SOR-Garden View Studio', '2', 'assigned', NULL, '2026-12-05', '2026-12-13', false, 'Petra', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Garden View Studio 2', 'Sorobon', 'BON-SOR-Garden View Studio', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Kas Chicitu', 'Sorobon', 'BON-SOR-Kas Chicitu', NULL, 'assigned', NULL, '2026-12-03', '2026-12-13', false, 'C. Rosjorde', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 1', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '1', 'assigned', NULL, '2026-12-05', '2026-12-13', false, 'Ramona Stelzer', 'houses close but not connected');

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 1', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '1', 'assigned', NULL, '2026-11-28', '2026-12-10', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 2', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '2', 'assigned', NULL, '2026-12-07', '2026-12-13', false, 'Tarah Wright', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 2', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 3', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '3', 'assigned', NULL, '2026-11-28', '2026-12-17', false, NULL, 'room pref: 26, 24, 22, 3, 5 or 7');

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 3', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '3', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 4', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '4', 'assigned', NULL, '2026-12-05', '2026-12-13', false, 'David Stelzer (son of Timo)', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Ocean Front Beach House 5', 'Sorobon', 'BON-SOR-Ocean Front Beach House', '5', 'available', NULL, '2026-12-07', '2026-12-13', false, NULL, 'Thomas Cramer (no pipeline entry)');

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Premium Ocean Front Beach House', 'Sorobon', 'BON-SOR-Premium Ocean Front Beach House', NULL, 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Premium Ocean Front Beach House 1', 'Sorobon', 'BON-SOR-Premium Ocean Front Beach House', '1', 'assigned', NULL, '2026-12-04', '2026-12-16', false, 'Regina von Bressensdorf', 'same room as last year');

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Premium Ocean Front Beach House 2', 'Sorobon', 'BON-SOR-Premium Ocean Front Beach House', '2', 'assigned', NULL, '2026-11-28', '2026-12-10', false, NULL, 'Week I booking, staying in Week II hotel');

-- Wanapa (17 rooms)
INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Balcony', 'Wanapa', 'BON-WAN-Double Deluxe Balcony', NULL, 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Balcony 1', 'Wanapa', 'BON-WAN-Double Deluxe Balcony', '1', 'assigned', NULL, '2026-12-07', '2026-12-13', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Balcony 1', 'Wanapa', 'BON-WAN-Double Deluxe Balcony', '1', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Balcony 2', 'Wanapa', 'BON-WAN-Double Deluxe Balcony', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Balcony 2', 'Wanapa', 'BON-WAN-Double Deluxe Balcony', '2', 'assigned', NULL, NULL, NULL, false, 'Helena Janz', NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 1', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '1', 'assigned', NULL, NULL, NULL, false, NULL, 'not confirmed yet');

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 1', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '1', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 2', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '2', 'assigned', NULL, '2026-12-07', '2026-12-13', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 2', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 3', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '3', 'assigned', NULL, '2026-12-06', '2026-12-13', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 3', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '3', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 4', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '4', 'assigned', NULL, '2026-12-07', '2026-12-13', false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Patio 4', 'Wanapa', 'BON-WAN-Double Deluxe Patio', '4', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Porch', 'Wanapa', 'BON-WAN-Double Deluxe Porch', NULL, 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Porch', 'Wanapa', 'BON-WAN-Double Deluxe Porch', NULL, 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Porch 1', 'Wanapa', 'BON-WAN-Double Deluxe Porch', '1', 'available', NULL, NULL, NULL, false, NULL, NULL);

INSERT INTO exp_hotel_rooms (name, hotel, room_type, room_number, status, experience_id, check_in, check_out, transfer_need, partner_tag_along, comments)
VALUES ('Double Deluxe Porch 2', 'Wanapa', 'BON-WAN-Double Deluxe Porch', '2', 'available', NULL, NULL, NULL, false, NULL, NULL);
