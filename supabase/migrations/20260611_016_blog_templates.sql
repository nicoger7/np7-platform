-- Migration 016: Blog post templates + membership gating
-- Builds on migration 015 (excerpt/category/author). Adds the structured
-- "template" system so editors pick a layout (Equipment Review, New Product
-- Introduction, Spotguide, Technique Guide) and fill a few fields instead of
-- hand-formatting — every post of a kind then renders the same, polished way.
--
-- All additive + idempotent (safe to paste into the Supabase SQL editor).

-- Which layout renders the post. "standard" = plain article (the original).
alter table exp_blog_posts
  add column if not exists template text not null default 'standard';

-- Structured, per-template fields (ratings, specs, steps, spot facts, …).
-- Shape is owned by src/lib/blog-templates.ts; the DB just stores the JSON.
alter table exp_blog_posts
  add column if not exists template_data jsonb not null default '{}'::jsonb;

-- Which world the post belongs to — drives accent colour + the overview filter
-- tabs (Travel / Gear). Usually derived from the template, editable per post.
alter table exp_blog_posts
  add column if not exists world text not null default 'experience';

-- Membership gate: when true (default), non-members see the teaser + signup
-- wall; members read in full. Set false for fully public posts (announcements).
alter table exp_blog_posts
  add column if not exists members_only boolean not null default true;

-- Overview filters by world among published posts, newest first.
create index if not exists exp_blog_posts_world_published_idx
  on exp_blog_posts (world, status, published_at desc);
