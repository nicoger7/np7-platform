-- 051: Pre-trip packing list + personal note (drives the pre-trip emails).
-- Additive only. Packing list is newline-separated text (one item per line).
-- The note lives per-experience, with an optional per-edition override for a
-- weekly personal touch.

alter table exp_content   add column if not exists packing_list  text;
alter table exp_content   add column if not exists pre_trip_note text;
alter table exp_editions  add column if not exists pre_trip_note text;
