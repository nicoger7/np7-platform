-- ============================================================
-- 20260623_054_payment_reconciliation.sql
--   Tie payments to the invoices they pay, so balances reflect what
--   was actually received and we can auto-suggest matches.
--   • exp_payments.document_id  → the invoice this payment settles
--   • documents.sent_at         → when the invoice was emailed (drives
--                                 the "invoice sent" status; no manual tick)
--   • documents.paid_at         → when fully reconciled (cached; also derivable)
--   • documents.due_date        → for "what's due next"
--   • exp_bookings.final_accepted_at / final_accept_note → team accepted a
--     short final payment as settlement (agreed price drops to what was paid)
--   Additive + idempotent. Migrations are applied manually.
-- ============================================================

-- ── Link a payment to the invoice it pays ───────────────────
alter table exp_payments add column if not exists document_id uuid references documents(id) on delete set null;
create index if not exists idx_exp_payments_document on exp_payments(document_id);

-- ── Invoice lifecycle timestamps ────────────────────────────
alter table documents add column if not exists sent_at  timestamptz;  -- emailed to the customer
alter table documents add column if not exists paid_at  timestamptz;  -- fully reconciled
alter table documents add column if not exists due_date date;         -- payment due by

-- ── Booking: accepting a short final payment as settlement ──
alter table exp_bookings add column if not exists final_accepted_at timestamptz;
alter table exp_bookings add column if not exists final_accept_note text;
