-- Multi-level in the member rater: "level it suits" (spot_ratings) becomes a list,
-- so a rider can say a spot works for several levels — mirrors spots.levels (082)
-- and spot_ratings.infrastructure (081). `spot_ratings.level` (single) is kept for
-- back-compat; code writes both (level = the first/primary) and reads `levels` when
-- present, aggregating each pick into the level consensus. Additive + tolerant.
-- Manual migration — paste in the Supabase SQL editor.

alter table spot_ratings
  add column if not exists levels text[] not null default '{}';

-- backfill from the existing single level
update spot_ratings
  set levels = array[level]
  where level is not null and level <> '' and cardinality(levels) = 0;
