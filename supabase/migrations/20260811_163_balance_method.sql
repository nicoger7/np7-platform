-- ============================================================================
-- 163 — How the remaining balance gets collected, per booking.
--
-- A part-payment event ticket (deposit now, balance before the clinic) leaves
-- a real decision that only a human can make: does this rider pay the rest by
-- card, by bank transfer, or in cash at the centre? Nothing recorded it, so
-- the balance was implicitly "Stripe" for everyone and an on-site payment had
-- nowhere to be declared before it happened.
--
-- Null = not decided yet; the member portal offers the card link, which is the
-- safe default because it is the only one that settles itself.
-- ============================================================================

alter table exp_bookings
  add column if not exists balance_method text;

alter table exp_bookings
  drop constraint if exists exp_bookings_balance_method_check;
alter table exp_bookings
  add constraint exp_bookings_balance_method_check
  check (balance_method is null or balance_method in ('stripe', 'transfer', 'onsite'));

comment on column exp_bookings.balance_method is
  'How the outstanding balance is collected: stripe (card link), transfer (bank, invoiced), onsite (cash/card at the centre, recorded by hand). Null = undecided, treated as stripe.';
