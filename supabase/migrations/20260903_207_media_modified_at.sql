-- The catalogue could not reproduce the library's own order.
--
-- The picker lists newest first, and every consumer relies on that, but the
-- first crawl stored only when WE saw a file, not when the file was written.
-- Sorting by that would have put six thousand files in the order the crawler
-- happened to walk them, which looks like working software and is not.
alter table public.media_assets
  add column if not exists modified_at timestamptz;

create index if not exists media_assets_recent
  on public.media_assets (modified_at desc nulls last)
  where missing_since is null;
