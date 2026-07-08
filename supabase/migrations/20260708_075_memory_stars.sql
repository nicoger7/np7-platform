-- 075 · Memory "keepers" — starred photos/videos that survive the 3-month purge
--
-- Trip media (photos in Supabase storage, videos in R2 _video/) is file-based,
-- so a star can't live on the row — it lives here. A star = "this photo/video
-- is a permanent keeper for this scope and must NOT be deleted by the retention
-- cron". The uploader requires 3 photo + 3 video stars per person so every
-- rider keeps a few highlights forever; everything else is purged 3 months after
-- the trip.
--
-- ref = the photo's storage path (memories/{edition}/…) OR the video's stem
-- (the R2 key minus the _video/ root + extension). booking_id null = the shared
-- "Everyone" scope.

create table if not exists memory_stars (
  id          uuid primary key default gen_random_uuid(),
  edition_id  uuid not null,
  booking_id  uuid,                                   -- null = "Everyone" scope
  kind        text not null check (kind in ('photo','video')),
  ref         text not null,                          -- photo path | video stem
  created_at  timestamptz not null default now()
);

create unique index if not exists memory_stars_kind_ref on memory_stars (kind, ref);
create index if not exists memory_stars_edition on memory_stars (edition_id);

-- Admin tools + retention cron use the service role (bypasses RLS); no public
-- access. Enable RLS with no policies so anon/authenticated can't touch it.
alter table memory_stars enable row level security;
