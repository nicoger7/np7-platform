-- Add-ons we ARRANGE but never bill.
--
-- Some extras (an airport transfer, a rental, a lesson with a local) are booked
-- by us as a favour but paid by the guest later, or in cash to the provider.
-- Today the only way to express that is a €0 price, which is ambiguous: it reads
-- as "free" to the guest, and the amount silently disappears from the trip total
-- with nothing explaining why.
--
-- `payment_mode`:
--   'np7'    — we invoice it, it joins the trip total (the existing behaviour)
--   'direct' — we arrange it, the guest pays elsewhere. NEVER enters the trip
--              total, an invoice, or a payment row.
--
-- `payment_note` carries the arrangement in the guest's words:
-- "Pay the driver in cash on arrival — €95 for up to 3 people".
alter table exp_components
  add column if not exists payment_mode text not null default 'np7',
  add column if not exists payment_note text;

do $$ begin
  alter table exp_components
    add constraint exp_components_payment_mode_check
    check (payment_mode in ('np7', 'direct'));
exception when duplicate_object then null; end $$;

-- The booking row keeps its OWN copy, stamped when the guest requests it — the
-- same reason price is copied. Changing a component later must not silently
-- re-price or re-classify add-ons already agreed on past bookings.
alter table exp_booking_addons
  add column if not exists payment_mode text not null default 'np7',
  add column if not exists payment_note text;

do $$ begin
  alter table exp_booking_addons
    add constraint exp_booking_addons_payment_mode_check
    check (payment_mode in ('np7', 'direct'));
exception when duplicate_object then null; end $$;

comment on column exp_components.payment_mode is
  'np7 = we invoice it; direct = we arrange it, the guest pays the provider. Direct never enters totals or invoices.';
comment on column exp_booking_addons.payment_mode is
  'Copied from the component when requested, so past bookings keep their agreed terms.';
