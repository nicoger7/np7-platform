-- 073 · YouTube hero video (with a [start,end] segment) for spotguide destinations
--
-- Mirrors the experience hero video (exp_content.hero_video_url/start/end) so a
-- destination's spotguide page can play a looped YouTube segment behind the
-- header — same <HeroVideo> component. All nullable → pages just keep showing
-- the hero_image until a URL is set. Code tolerates absence pre-migration.

alter table destinations
  add column if not exists hero_video_url   text,
  add column if not exists hero_video_start int,   -- loop start, seconds (null/0 = from the top)
  add column if not exists hero_video_end   int;   -- loop end, seconds (null = to the end)

comment on column destinations.hero_video_url is 'Optional YouTube URL/ID for the spotguide hero; falls back to hero_image as poster.';
comment on column destinations.hero_video_start is 'Segment start in seconds (loops [start,end]).';
comment on column destinations.hero_video_end is 'Segment end in seconds (loops [start,end]).';
