-- ============================================================================
-- 152 — What a week actually delivers: video analysis & professional photos
-- are per-EDITION facts, not copy.
--
-- The website's "what you take home" promises photo & video for every week,
-- and the package overview says nothing about the member area at all. But a
-- photographer travels to SOME weeks; video analysis runs on SOME editions.
-- Whether those promises are true is decided per edition — so that is where
-- the fact lives.
--
-- NULL means "not decided" and keeps today's behaviour (the promise shows).
-- Only an explicit FALSE pulls the photo/video card off the public page —
-- the toggle is for taking a promise DOWN, not for having to remember to
-- switch every new edition on.
-- ============================================================================

alter table exp_editions add column if not exists video_analysis boolean;
alter table exp_editions add column if not exists photoshoot boolean;

comment on column exp_editions.video_analysis is
  'Does this edition include video analysis? NULL = not decided (website shows the default promise). Drives the "what you take home" card and the member-area benefit line.';
comment on column exp_editions.photoshoot is
  'Does a professional photographer shoot this edition? NULL = not decided. Same wiring as video_analysis.';
