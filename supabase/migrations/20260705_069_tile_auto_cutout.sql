-- 069 · Experience tile generator + coach cutout URL
--
-- tile_auto: when true, the experience page generates a tile image automatically
--            from the experience photo + coach cutout. Defaults off -- no visible
--            change until flipped per-experience.
-- cutout_url: URL of the coach's transparent PNG cutout used in tile generation.
--
-- Additive + idempotent.

alter table exp_experiences
  add column if not exists tile_auto boolean not null default false;

alter table exp_coaches
  add column if not exists cutout_url text;

comment on column exp_experiences.tile_auto is
  'When true, auto-generate a promotional tile image from the experience hero + coach cutout.';

comment on column exp_coaches.cutout_url is
  'URL of the coach transparent PNG cutout (no background) used for tile generation.';
