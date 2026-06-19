-- Migration 015: Blog post editorial fields
-- exp_blog_posts has existed since setup.sql (title, slug, content, cover_image,
-- status draft|published, published_at) with RLS already in place:
-- public read when published (setup.sql), team write / admin delete (migration 009).
-- This adds the fields the blog admin + public pages need.

alter table exp_blog_posts add column if not exists excerpt  text;
alter table exp_blog_posts add column if not exists category text;
alter table exp_blog_posts add column if not exists author   text not null default 'Nico Prien';

-- Public blog index filters on status and sorts by publish date.
create index if not exists exp_blog_posts_status_published_idx
  on exp_blog_posts (status, published_at desc);
