-- 076 · Destination vibe tags — powers the light Spotguide filter
--
-- Free-form-ish tags from a curated vocab (family-friendly, beginner-friendly,
-- flat water, waves, …) so visitors can filter destinations by feel, alongside
-- country + level (which already exist). Nullable/default empty → the filter
-- just shows fewer facets until they're populated; code tolerant pre-migration.

alter table destinations
  add column if not exists tags text[] not null default '{}';

comment on column destinations.tags is 'Curated vibe tags for the spotguide filter (family-friendly, beginner-friendly, flat-water, waves, freestyle, uncrowded, easy-launch, year-round).';
