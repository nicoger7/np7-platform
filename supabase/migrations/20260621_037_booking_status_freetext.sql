-- ============================================================
-- 20260621_037_booking_status_freetext.sql
--   Free-registration leads land as status 'registered', but exp_bookings still
--   had the original status CHECK constraint (migration 001) that didn't include
--   it — so registration failed with "violates check constraint
--   exp_bookings_status_check". Migration 030 assumed status was free text; this
--   makes it so. Status values are controlled by the app/pipeline, not the DB.
-- ============================================================

alter table exp_bookings drop constraint if exists exp_bookings_status_check;
