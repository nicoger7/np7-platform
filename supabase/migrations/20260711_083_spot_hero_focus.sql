-- Spot hero re-framing: a CSS object-position ("50% 30%") so the admin can drag
-- the hero photo to choose what the 16:9 crop keeps (ported from the magazine
-- cover-reframe, exp_blog_posts.cover_focus). null = centered. Additive.
-- Manual migration — paste in the Supabase SQL editor.

alter table spots
  add column if not exists hero_focus text;
