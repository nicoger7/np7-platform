-- Multi-level destinations: the admin editor's "Level from / Level to" range
-- becomes a real multi-select. `destinations.levels text[]` is the source of truth;
-- level_min / level_max are still written (derived = the span of the picked set) so
-- the public spotguide range label (levelRangeLabel) keeps working unchanged.
-- Mirrors spots.levels (082). Additive + tolerant (code derives from min/max when
-- the column is missing). Manual migration — paste in the Supabase SQL editor.

alter table destinations
  add column if not exists levels text[] not null default '{}';

-- Backfill the full span between level_min and level_max (inclusive), in rank order,
-- so an existing "Intermediate–Pro" destination shows Intermediate/Advanced/Amateur/
-- Semi-Pro/Pro all selected in the new multi-select.
update destinations d
set levels = (
  select coalesce(array_agg(lv order by ord), '{}')
  from unnest(array['Beginner','Intermediate','Advanced','Amateur','Semi-Pro','Pro']) with ordinality as t(lv, ord)
  where ord >= (select o from unnest(array['Beginner','Intermediate','Advanced','Amateur','Semi-Pro','Pro']) with ordinality as a(l, o) where l = d.level_min)
    and ord <= (select o from unnest(array['Beginner','Intermediate','Advanced','Amateur','Semi-Pro','Pro']) with ordinality as b(l, o) where l = d.level_max)
)
where level_min is not null and level_max is not null and cardinality(levels) = 0;
