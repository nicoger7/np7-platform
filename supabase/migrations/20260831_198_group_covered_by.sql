-- 198 · Group bookings, phase 1: one payer covers several travellers.
--
-- A covered booking keeps its OWN agreed_price (the per-person figure the
-- edition P&L and the §25 UStG margin settlement need) but is never invoiced
-- itself: its money runs through the payer's booking, whose invoices and
-- payment plan sum the whole group. "Money never splits" — design in
-- docs/group-bookings.md, model A confirmed by Nico 2026-08-31.
--
-- on delete set null: if the payer's booking is ever hard-deleted the covered
-- booking degrades to a normal self-paying one rather than pointing nowhere.

alter table exp_bookings add column if not exists covered_by_booking_id uuid references exp_bookings(id) on delete set null;
create index if not exists idx_bookings_covered_by on exp_bookings(covered_by_booking_id) where covered_by_booking_id is not null;
