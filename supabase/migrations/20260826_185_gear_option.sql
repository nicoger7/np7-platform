-- 185: the gear choice (Model A, decided 2026-08-26) stays RELATIONAL.
-- gear_option marks the components that govern the booking-time choice
-- "Rental (included) vs Storage vs Own gear". Base package prices keep the
-- rental baked in; choosing storage/own-gear writes a DELTA add-on row that
-- references these components (sell_price is the customer truth, unit_cost
-- stays internal). Editions whose components aren't built yet simply show no
-- choice — nothing retroactive.
alter table exp_components add column if not exists gear_option text
  check (gear_option in ('rental','storage'));
