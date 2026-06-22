-- ============================================================
-- 20260622_043_zero_deposit_50_downpayment.sql
--   Pricing policy: experiences carry NO securing deposit.
--   The first invoice is the 50% down-payment; the rest is the
--   final balance. Collapses every booking to a clean 2-stage
--   plan (down-payment -> final) — see computePaymentPlan() which
--   drops zero-amount milestones.
--
--   Why explicit 0 (not NULL): the deposit resolver is
--     edition.deposit ?? package.deposit ?? 300
--   (src/lib/invoices/generate.ts, src/app/account/bookings/[id]/page.tsx).
--   A NULL deposit falls back to the €300 default, so it MUST be 0.
--
--   Data-only. Idempotent + re-runnable. Safe: no booking relies on a
--   deposit milestone (no deposit_received / deposit_invoice_sent set).
-- ============================================================

-- Editions win over packages in the resolver, so they must be 0 too.
update exp_editions set deposit = 0 where deposit is distinct from 0;

-- Packages: deposit 0 (covers edition-less packages e.g. WindWeek) and
-- pin the down-payment at 50% so new editions inherit the policy.
update exp_packages
   set deposit = 0,
       downpayment_percent = 50
 where deposit is distinct from 0
    or downpayment_percent is distinct from 50;
