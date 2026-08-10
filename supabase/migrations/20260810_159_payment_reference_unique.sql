-- ============================================================================
-- 159 — One Stripe charge, one payment row.
--
-- Stripe delivers a webhook AT LEAST once and retries on timeout, so the same
-- checkout.session.completed can arrive twice. The only thing standing between
-- that and a doubled payment row was an application-side read-then-write: check
-- for the reference, then insert. Two overlapping deliveries both read "not
-- there" and both insert.
--
-- Worse, the check used maybeSingle(), which ERRORS on two matching rows — so
-- the first duplicate would permanently disable the guard, and every further
-- redelivery would add another row. exp_payments drives reconciliation and the
-- edition P&L, so a doubled row overstates revenue in the one place anyone
-- would look to catch it.
--
-- The database is where this belongs. Partial: only rows that actually carry a
-- reference, so hand-entered bank transfers (reference null) are untouched.
-- ============================================================================

-- Any duplicates already in the table would block the index. There are none
-- today; if one ever appears, this keeps the oldest and is safe to re-run.
delete from exp_payments a
 using exp_payments b
 where a.reference is not null
   and a.reference = b.reference
   and a.created_at > b.created_at;

create unique index if not exists exp_payments_reference_unique
  on exp_payments (reference)
  where reference is not null;

comment on index exp_payments_reference_unique is
  'One row per Stripe payment intent. The webhook may be delivered more than once; this is what makes recording it idempotent, rather than the read-then-write in the route.';
