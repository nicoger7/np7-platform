-- Migration 013: Experience website content — media fields
-- Adds the event-page image/video fields to exp_content:
--   hero_image      — event-page hero (separate from the listing tile)
--   hero_video_url  — YouTube link; when set, takes priority over hero_image
--   gallery         — gallery image URLs
--   reviews         — [{ name, country, quote, rating, image }]
-- (The listing "tile" image remains exp_experiences.hero_image.)

alter table exp_content
  add column if not exists hero_image     text,
  add column if not exists hero_video_url text,
  add column if not exists gallery        text[] not null default '{}',
  add column if not exists reviews        jsonb  not null default '[]'::jsonb;
