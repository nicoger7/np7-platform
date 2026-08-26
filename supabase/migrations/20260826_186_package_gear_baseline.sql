-- 186: the gear choice, designed through at PACKAGE level (Nico, 2026-08-26).
-- Every package DECLARES what its price already contains:
--   'rental'  — rental gear is in the price (the common case)
--   'storage' — storage is in the price (own-gear packages)
--   'none'    — neither (e.g. Tenerife "Experience Only")
-- The public choice renders relative to this baseline: the baseline option
-- reads "included" (±0), the others quote sell-price DELTAS — up or down.
-- Null = 'rental' (legacy default), so nothing existing changes behaviour.
alter table exp_packages add column if not exists gear_baseline text
  check (gear_baseline in ('rental','storage','none'));
