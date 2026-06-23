-- ============================================================
-- 20260624_055_addon_meta.sql
--   Structured detail per add-on (jsonb). First use: extra hotel
--   nights need the actual dates — which nights they want, not just
--   a count. We store { checkIn, checkOut, nightsBefore, nightsAfter }
--   so the hotel desk books the right nights.
--   Additive + idempotent; code reads it tolerantly (pre-migration → {}).
-- ============================================================

alter table exp_booking_addons add column if not exists meta jsonb not null default '{}'::jsonb;
