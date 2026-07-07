-- 071 · Magazine cover focal point (reframe without re-cropping files)
--
-- Cards and the post hero crop covers with CSS `cover`; off-center or
-- non-16:9 images cut awkwardly. `cover_focus` stores a CSS object-position
-- value (e.g. '50% 35%') chosen in the admin editor's drag-to-reframe tool;
-- the front-end applies it as background-position. NULL = center (today's
-- behaviour, unchanged).
--
-- Also sets sensible focal points for the four covers the 2026-07-07 audit
-- flagged as badly cropped (65/60/44/42% loss at 16:9).
--
-- Additive + idempotent. Code ships tolerant (works before this is applied).

alter table exp_blog_posts add column if not exists cover_focus text;

comment on column exp_blog_posts.cover_focus is
  'CSS object-position for the cover crop (e.g. ''50% 35%''); null = center. Set via the admin reframe tool.';

-- audit fixes — only where the editor has not already chosen a framing
update exp_blog_posts set cover_focus = '50% 60%' where slug = 'fit-your-fin'              and cover_focus is null; -- portrait fin: mid-blade with the N7 logo
update exp_blog_posts set cover_focus = '50% 45%' where slug = 'freeride-guide'            and cover_focus is null; -- magazine cover: the carving action shot
update exp_blog_posts set cover_focus = '50% 45%' where slug = 'sail-trimming-mistakes'    and cover_focus is null; -- square diagram: sail + upper labels
update exp_blog_posts set cover_focus = '55% 50%' where slug = 'windsurf-faster-5-secrets' and cover_focus is null; -- wide banner: rider + board
