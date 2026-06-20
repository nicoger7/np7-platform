-- 20260619_025_booking_flight_info.sql
-- Additive-only. A structured home for member-entered flight details (times +
-- flight numbers). Arrival/departure DATES continue to live in the existing
-- fly_in / fly_out columns (Notion-synced, admin-visible); this just adds the
-- extra detail. Until applied, the portal stores the same payload in a notes
-- sentinel so the feature works regardless.
alter table exp_bookings add column if not exists flight_info jsonb;
