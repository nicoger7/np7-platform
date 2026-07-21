-- 114: two additive changes (applied live via the Management API).
--
-- (a) Payments can be tagged as an add-on / extra service. These sit OUTSIDE the
--     trip total (paymentInflow() returns 0 for them) so they never distort the
--     trip balance — they're just recorded and labelled.
alter table exp_payments drop constraint exp_payments_type_check;
alter table exp_payments add constraint exp_payments_type_check
  check (type = any (array['deposit','downpayment','final','partial','refund','addon']));

-- (b) A hotel room can hold more than one guest: the main guest is booking_id,
--     additional participants who share the room (own booking, no room of their
--     own) go in extra_booking_ids. A companion with no booking at all still uses
--     the existing partner_tag_along text column.
alter table exp_hotel_rooms add column if not exists extra_booking_ids uuid[];
