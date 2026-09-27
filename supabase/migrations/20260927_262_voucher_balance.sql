-- 262 · What is left on a gift voucher
--
-- A voucher was single-use. Whatever the trip did not need was simply lost: a
-- €10,000 gift used on a €2,390 week threw away €7,610, and the guest only
-- found out afterwards (Nico, 27 Sep 2026: the vouchers are "weird and
-- incorrect").
--
-- `balance` is what is still on the voucher. NULL means it was never used, so
-- it is worth its full `amount`, which is why no backfill is needed: every row
-- today is either untouched (NULL = amount) or fully redeemed.
--
-- The redeem route (src/app/api/portal/vouchers/redeem/route.ts) takes what the
-- trip still owes, writes the rest here and keeps the voucher 'active' while
-- more than a cent is left. Only then does it become 'redeemed'.
--
-- A new column on an existing table, so no GRANT is needed.

alter table gift_vouchers
  add column if not exists balance numeric;

comment on column gift_vouchers.balance is
  'What is still on the voucher. NULL = never used, worth the full amount. Lowered by each use; the voucher stays active while balance > 0.01.';
