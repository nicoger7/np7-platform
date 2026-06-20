-- ============================================================
-- 20260621_032_payment_milestones.sql
--   Registration Phase 2 — the deposit → downpayment → final
--   payment plan. Per-package milestone config + a securing-deposit
--   milestone on the booking + the 'deposit' payment type.
--   Builds on the existing downpayment/final flags + invoicing (021).
--   Additive + idempotent.
-- ============================================================

-- ── Per-package milestone config ────────────────────────────
-- The securing deposit amount itself lives in exp_packages.deposit (already
-- read by the invoice engine); ensure it exists, then add the schedule knobs.
alter table exp_packages add column if not exists deposit numeric;                                 -- securing deposit (€); null → falls back to default
alter table exp_packages add column if not exists deposit_refund_days  int     not null default 14; -- deposit stays refundable this many days after payment
alter table exp_packages add column if not exists downpayment_percent  numeric not null default 50; -- % of the trip total due by the downpayment stage
alter table exp_packages add column if not exists final_days_before    int     not null default 90; -- final balance due this many days before the trip starts

-- ── Booking: the securing-deposit milestone ─────────────────
-- (downpayment_received / final_payment_received already exist.)
alter table exp_bookings add column if not exists deposit_received      boolean not null default false;
alter table exp_bookings add column if not exists deposit_received_at    timestamptz;
alter table exp_bookings add column if not exists deposit_invoice_sent   boolean not null default false;

-- ── Payments: allow the securing-deposit type ───────────────
-- existing: downpayment | final | partial | refund
alter table exp_payments drop constraint if exists exp_payments_type_check;
alter table exp_payments add constraint exp_payments_type_check
  check (type in ('deposit','downpayment','final','partial','refund'));

-- documents.type is free text (no constraint), so the new 'downpayment_invoice'
-- document type needs no DDL here.
