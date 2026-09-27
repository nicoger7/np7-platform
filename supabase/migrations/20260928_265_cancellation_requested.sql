-- 265 · When a guest asked to cancel
--
-- The trip page's "Cancel this trip" (POST /api/portal/bookings/[id]/cancel)
-- only ever appended a note to the booking: no status, no column, nothing a
-- sweep could find. It is the guest action with the most money at stake (the
-- § 651h refund duty, and the rule that the down-payment is the cancellation
-- fee from the moment it lands), and nobody was told (Nico, 28 Sep 2026).
--
-- The route now stamps this once, on the FIRST request, and the team-alert
-- sweep (cancellation_requested, src/lib/email/team-alerts-guests.ts) reads it.
-- The note stays the human record. Until this is applied the route's stamp
-- write fails quietly and nothing else changes.
--
-- Additive, nullable, no backfill: the notes show no request has ever been made.

alter table exp_bookings
  add column if not exists cancellation_requested_at timestamptz;

comment on column exp_bookings.cancellation_requested_at is
  'When the guest first pressed Cancel this trip in the portal. A request, not a cancellation: nothing is cancelled or refunded until the team does it. Read by the cancellation_requested team alert.';

-- The sweep asks for requests in the last few hours; almost every row is null.
create index if not exists exp_bookings_cancellation_requested_idx
  on exp_bookings (cancellation_requested_at)
  where cancellation_requested_at is not null;

notify pgrst, 'reload schema';
