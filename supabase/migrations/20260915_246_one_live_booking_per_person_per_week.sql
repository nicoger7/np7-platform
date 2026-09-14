-- ============================================================
-- 20260915_246_one_live_booking_per_person_per_week.sql
--
--   ⚠ WRITTEN, NOT APPLIED. Two preconditions, both named below.
--
--   One person, one live booking, one week. Today that invariant lives only in
--   application code: /api/register reads (findLiveBookings), then inserts,
--   with no transaction between the two. Two requests a few hundred ms apart
--   both pass the read and both insert. Production already holds two such
--   pairs (Nico Prien on OBX Wind Oct 2026, Brad Williams on Bonaire Week III,
--   six seconds apart). Each duplicate is a second pro-forma, a second payment
--   plan, a second group_spot_covered mail and a second row in open revenue.
--
--   Only the database can close that race. The indexes below mirror exactly
--   how findLiveBookings keys "this week", so the constraint and the code can
--   never disagree:
--     · an edition-scoped booking is keyed on (contact_id, edition_id)
--     · an edition-less one on (contact_id, experience_id), matching the
--       `.is("edition_id", null)` branch. Keying every booking on the
--       experience alone would refuse a repeat customer next year's Bonaire,
--       which is the business.
--
--   coalesce(status, 'lead'): a null status reads as "lead", i.e. LIVE, in
--   normalizeBookingStatus. `status not in (...)` would silently drop those
--   rows out of the index and leave the very case the guard is for unguarded.
--   'cancelled' is in the exclusion list beside 'lost' because LEGACY_STATUS_MAP
--   maps the Notion-era spelling onto lost. Excluding lost is not incidental:
--   it is what lets Derek Rotz cancel Bonaire Week III and rebook it.
--
--   THE created_at FLOOR is what makes this applicable without touching a
--   single production row. It is a promise about bookings made from now on and
--   says nothing about the two duplicates already there, so nobody has to
--   clean data to create the index. The literal is a typed constant and
--   therefore immutable, which is what a partial index predicate requires.
--
--   BEFORE APPLYING:
--   1. Nico decides what happens to the two existing duplicate pairs. The
--      floor means the index does not force the question, but the duplicates
--      keep costing what they cost until somebody answers it.
--   2. src/app/api/event/checkout/route.ts must handle 23505 first. That route
--      reuses only bookings whose notes start "Event ticket (", so a guest who
--      registered interest in a week and then buys a clinic ticket on the same
--      edition would hit the violation and be told "Could not create your
--      booking". /api/register and createCompanionBookings already handle the
--      code (isUniqueViolation in src/lib/existing-booking.ts); the event
--      checkout does not.
--
--   Additive and idempotent. A plain CREATE INDEX takes a short write lock on
--   exp_bookings; the table is in the low thousands of rows, so this is
--   seconds, but run it outside a booking push.
-- ============================================================

create unique index if not exists uniq_live_booking_per_edition
  on exp_bookings (contact_id, edition_id)
  where contact_id is not null
    and edition_id is not null
    and coalesce(status, 'lead') not in ('lost', 'cancelled')
    and created_at >= timestamptz '2026-09-15 00:00:00+00';

create unique index if not exists uniq_live_booking_per_experience
  on exp_bookings (contact_id, experience_id)
  where contact_id is not null
    and edition_id is null
    and coalesce(status, 'lead') not in ('lost', 'cancelled')
    and created_at >= timestamptz '2026-09-15 00:00:00+00';
