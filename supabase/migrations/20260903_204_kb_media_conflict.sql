-- The duplicate guard on kb_media was an EXPRESSION index, coalesce(section_key,''),
-- and PostgREST's on_conflict can only name plain columns: every attach failed
-- with "no unique or exclusion constraint matching the ON CONFLICT
-- specification". Found the moment the first photo was attached.
--
-- A plain unique index takes its place. It does not catch a repeat while
-- section_key is null, because NULLs are distinct in an index, so the route
-- filters existing refs before inserting instead. That is the honest split: the
-- database guards what it can, the code guards the rest, and neither pretends
-- to do the other's job.
drop index if exists public.kb_media_unique;
create unique index if not exists kb_media_unique
  on public.kb_media (entry_id, section_key, ref);
