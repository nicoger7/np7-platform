-- 235 · Can this money be seen in the bank?
--
-- Every one of the 150 payments in this table was typed by a human, because
-- until yesterday nobody could see the bank from here. Now the bank is in the
-- system, and the two kinds of row have to stop looking alike:
--
--   · money that IS in the Qonto feed and was recorded by hand anyway — the
--     same euro written down twice, which is exactly how bank lines 229 and 233
--     put €6,210 into revenue and the edition P&L twice over
--   · money that will NEVER be in the Qonto feed, because it was wired to the
--     old Surfcenter account, or paid in cash, or offset. Real, owed, and
--     correctly recorded by hand.
--
-- Nothing in the schema could tell those apart, so nobody could either, and the
-- unmatched pile could never be finished: you cannot close a list when you
-- cannot say which items are supposed to be closable.
--
-- `provenance` makes the pile finishable.
--   bank       — born from a real bank_transactions row. Provable.
--   off_bank   — deliberately recorded by a person, WITH a written reason,
--                because the money landed somewhere this system cannot see.
--   unverified — the legacy rows. Not wrong, just not yet decided. Every one
--                should end up as one of the two above.
--
-- Amounts, dates, bookings and invoices are untouched. This adds a label and
-- nothing else, so no figure anywhere in the admin moves because of it.

alter table exp_payments
  add column if not exists provenance text not null default 'unverified',
  add column if not exists off_bank_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exp_payments_provenance_check') then
    alter table exp_payments
      add constraint exp_payments_provenance_check
      check (provenance in ('bank', 'off_bank', 'unverified'));
  end if;
end $$;

/*
 * An off-bank payment without a reason is the thing this column exists to
 * prevent: an unexplained figure that looks as solid as a bank movement. The
 * constraint is what stops that being possible rather than merely discouraged.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exp_payments_off_bank_needs_reason') then
    alter table exp_payments
      add constraint exp_payments_off_bank_needs_reason
      check (provenance <> 'off_bank' or coalesce(btrim(off_bank_reason), '') <> '');
  end if;
end $$;

-- Backfill. A row already tied to a real movement is provable; everything else
-- is honestly "not decided yet" rather than quietly assumed good.
update exp_payments set provenance = 'bank'
  where bank_transaction_id is not null and provenance <> 'bank';

-- The work queue: which payments still need someone to say what they are.
create index if not exists exp_payments_provenance on exp_payments(provenance)
  where provenance = 'unverified';

comment on column exp_payments.provenance is
  'bank = created from a real bank_transactions row · off_bank = recorded by hand with a reason, money this system cannot see · unverified = pre-bank legacy row, still to be decided';
