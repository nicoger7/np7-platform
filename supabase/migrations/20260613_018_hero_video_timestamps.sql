-- Hero video segment timestamps for the public event hero.
-- exp_content.hero_video_url already drives the looping YouTube background;
-- these let an editor pin a start/end (seconds) so only a segment plays + loops.

ALTER TABLE exp_content
  ADD COLUMN IF NOT EXISTS hero_video_start integer,
  ADD COLUMN IF NOT EXISTS hero_video_end   integer;
