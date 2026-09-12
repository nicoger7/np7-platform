-- 239 · Money from before this company invoiced is history, not accounting
--
-- Nico, 2026-09-12: "we dont want to mix all the payments already done into
-- the bank. Whats important for us is to record everything correctly since we
-- switched invoicing to NP7 GmbH. Everything before we need to keep somewhere
-- in the archive and for the bookings etc., but on accounting level it doesnt
-- matter to us."
--
-- The switch is not a date anyone typed; it is the day this company issued
-- its first invoice: SCXP-2026-0001 on 2026-08-04 (the prefix still said
-- Surfcenter, the counter and the GmbH were already NP7's; NP7-XP-2026-0003
-- follows on 2026-08-07 in the same series). Everything paid before that day
-- was invoiced by Surfcenter Experience and is settled in their books, not
-- ours. Four out of five euros already received for the Bonaire weeks are of
-- that kind.
--
-- `legacy` therefore means: keep it, count it toward the booking's balance so
-- the guest and the trip page stay right, and leave it OUT of reconciliation,
-- out of the bank matching pile and out of every accounting export. It is
-- never a "to do". Migration 235 had labelled all of these `unverified`,
-- which was honest but made 150 rows look like work when only the 26 since
-- the switch actually are.
--
-- Undated rows are the nine created on 2026-06-23, the Notion migration, all
-- Surfcenter era, so created_at is the right fallback for them.

alter table exp_payments drop constraint if exists exp_payments_provenance_check;
alter table exp_payments
  add constraint exp_payments_provenance_check
  check (provenance in ('bank', 'off_bank', 'unverified', 'legacy'));

update exp_payments
   set provenance = 'legacy'
 where provenance = 'unverified'
   and coalesce(date, received_at::date, created_at::date) < date '2026-08-04';

comment on column exp_payments.provenance is
  'bank = created from a real bank_transactions row · off_bank = recorded by hand with a reason, money this system cannot see · unverified = since the NP7 GmbH switch (2026-08-04) but not yet tied to the bank, still to be decided · legacy = before the switch, Surfcenter-era money, kept for booking balances and out of accounting';
