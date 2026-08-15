-- ============================================================================
-- 165 — The payment-reference uniqueness was far too wide.
--
-- Migration 159 added:
--     create unique index exp_payments_reference_unique
--       on exp_payments (reference) where reference is not null;
--
-- The intent was narrow: a Stripe webhook redelivery must not record the same
-- charge twice, and its `reference` is the payment_intent (pi_…), which is
-- genuinely unique forever.
--
-- But `reference` is also the box a human types a bank-statement line number
-- into — "116", "233", "0". Making that column globally unique meant the same
-- statement number could never be used twice ANYWHERE on the platform, so
-- recording a real bank transfer failed with a duplicate-key error and no way
-- forward. Which is exactly what happened on the Bonaire Week I bookings.
--
-- Scope it to what it was for. Stripe intents keep their guarantee; humans get
-- their reference box back.
-- ============================================================================

drop index if exists exp_payments_reference_unique;

create unique index if not exists exp_payments_stripe_reference_unique
  on exp_payments (reference)
  where reference is not null and reference like 'pi_%';

comment on index exp_payments_stripe_reference_unique is
  'Stops a Stripe webhook redelivery recording the same charge twice. Scoped to payment-intent references only — bank statement numbers are typed by hand and repeat legitimately.';
