-- Per-edition packing list.
--
-- `pre_trip_note` already exists on BOTH exp_content (per experience) and
-- exp_editions (per edition), so the note can be tailored to a given year while
-- the packing list could not — even though kit is exactly the thing that varies:
-- Alaçatı in August and Bonaire in January need different bags.
--
-- Same override shape as the note: edition value wins, experience value is the
-- fallback, so nothing changes for editions that leave it blank.
alter table exp_editions
  add column if not exists packing_list text;

comment on column exp_editions.packing_list is
  'Overrides exp_content.packing_list for this edition. Blank = use the experience list.';
