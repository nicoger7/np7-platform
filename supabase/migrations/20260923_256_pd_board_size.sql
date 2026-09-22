-- 256: a board's size as the brand names it ("85", "107 l").
--
-- A board is called by year, brand, model and size, in that order (Nico,
-- 2026-09-23), not by the name somebody typed. Year, brand and model already
-- have columns; size did not, so it lived inside the typed name. Free text on
-- purpose: one brand's "85" is a width, another's "107" is litres.

set lock_timeout = '4s';

alter table public.pd_boards add column if not exists size text;

comment on column public.pd_boards.size is
  'Size as the brand names it ("85", "107 l"). Title order: year, brand, model, size.';

notify pgrst, 'reload schema';
