-- 184: rental/storage as booking-time checkboxes ("Option B", go 2026-08-26).
-- A component flagged offer_at_booking is offered as an optional extra in the
-- public booking flow; ticking it creates a confirmed exp_booking_addons row,
-- so pricing, member plan, invoices (incl. the add-on invoice) and P&L all
-- ride the existing add-on rails. Halves the package matrix: no more
-- "Own Gear" / "+ Rental" package variants needed.
alter table exp_components add column if not exists offer_at_booking boolean not null default false;
