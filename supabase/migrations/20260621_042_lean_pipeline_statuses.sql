-- ============================================================
-- 20260621_042_lean_pipeline_statuses.sql
--   Collapse the legacy 12-status Notion CRM pipeline down to the lean,
--   self-serve funnel:
--
--       lead → reserved → confirmed → paid → attended   (+ lost)
--
--   "Confirmed" = the Stripe hold-deposit is in, so the spot is secured and the
--   rider is attending. Payment progress (Stripe deposit → downpayment → full)
--   is tracked by the payment flags + the Payments page, NOT by pipeline columns.
--
--     1) Remap every existing booking onto the new vocabulary.
--     2) Re-pin a CHECK constraint to the 6 lean values (037 had dropped it).
--
--   The remap mirrors LEGACY_STATUS_MAP in src/lib/types.ts. The app already
--   normalizes any un-migrated row on read, so this is safe to apply any time.
--
--   NOTE: if the Notion → Supabase booking sync still writes legacy status
--   strings, point it at these 6 values (or it will hit the new constraint).
-- ============================================================

begin;

-- 1 · Remap existing rows ------------------------------------------------------
-- pre-deposit nurture stages → a plain lead
update exp_bookings set status = 'lead'
  where status in ('registered', 'interested', 'enquiring', 'contact_by_phone', 'ready_to_book');

-- checkout started, deposit not in yet
update exp_bookings set status = 'reserved'
  where status = 'payment_pending';

-- hold-deposit paid (and the post-deposit "create invoice" task) → confirmed
update exp_bookings set status = 'confirmed'
  where status in ('downpayment_paid', 'create_invoice');

-- cancelled is just lost
update exp_bookings set status = 'lost'
  where status = 'cancelled';

-- anything else (typos / nulls) → lead, so the constraint below is satisfiable
update exp_bookings set status = 'lead'
  where status is null
     or status not in ('lead', 'reserved', 'confirmed', 'paid', 'attended', 'lost');

-- 2 · Pin the vocabulary -------------------------------------------------------
alter table exp_bookings drop constraint if exists exp_bookings_status_check;
alter table exp_bookings add constraint exp_bookings_status_check
  check (status in ('lead', 'reserved', 'confirmed', 'paid', 'attended', 'lost'));

commit;
