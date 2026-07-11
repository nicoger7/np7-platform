-- Multi-level spots: a spot can suit several rider levels (e.g. Beginner–Advanced),
-- so its level becomes a list. Same array pattern as spots.conditions.
-- `spots.level` (single) is kept for back-compat; code writes both (level = the
-- first/primary) and reads `levels` when present. Additive + tolerant.
-- Manual migration — paste in the Supabase SQL editor.

alter table spots
  add column if not exists levels text[] not null default '{}';

-- backfill from the existing single level
update spots
  set levels = array[level]
  where level is not null and level <> '' and cardinality(levels) = 0;
