-- ============================================================================
-- 189 — Quantity on booking add-ons.
--
-- Five extra nights at Sorobon meant FIVE identical rows, each typed by hand.
-- Now it is one row with quantity 5.
--
-- THE INVARIANT, and the reason this migration is shaped the way it is:
--
--     price = round(unit_price * quantity, 2)      -- price stays the LINE TOTAL
--
-- Nine separate places already read `price` and turn it into money: the member
-- payment plan, both invoice generators, the add-on invoice, the edition P&L,
-- the dashboard, the confirmation emails and the portal. Redefining `price` as
-- a UNIT price would have required every one of them to learn about quantity,
-- and missing a single one would have silently billed the wrong amount.
--
-- So quantity and unit_price are ADDITIVE: they describe how the line total was
-- reached, and every existing consumer keeps reading the same total it always
-- read. Writers are responsible for keeping the invariant true — there are only
-- three (admin add-ons, portal add-ons, registration).
-- ============================================================================

alter table exp_booking_addons
  add column if not exists quantity integer not null default 1,
  add column if not exists unit_price numeric;

-- Every existing row is one item at its own price, so the invariant already
-- holds once unit_price mirrors price.
update exp_booking_addons set unit_price = price where unit_price is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exp_booking_addons_quantity_positive'
  ) then
    alter table exp_booking_addons
      add constraint exp_booking_addons_quantity_positive check (quantity > 0);
  end if;
end $$;

comment on column exp_booking_addons.price is
  'LINE TOTAL (unit_price × quantity), not a unit price. Every money surface reads this column directly.';
comment on column exp_booking_addons.quantity is
  'How many of the item. Default 1. price must always equal round(unit_price * quantity, 2).';
comment on column exp_booking_addons.unit_price is
  'Price of ONE unit. Kept for display and for re-deriving the total when quantity changes.';
