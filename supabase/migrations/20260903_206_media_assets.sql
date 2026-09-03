-- One row per file. The catalogue the product never had.
--
-- Until now the BUCKET was the catalogue: memories, trip videos and the website
-- library were all discovered by listing storage, and every consumer re-derived
-- meaning from the path. That has three costs we keep paying. Nothing can carry
-- metadata, so there is no caption, no alt text, no search. Nothing knows where
-- a file is used, so a delete is a guess. And every reference is a path, so the
-- day somebody renames a folder, references break in silence.
--
-- It also explains why photos are still in Supabase at all: R2 has been primary
-- for serving since the R2 rollout, and the Supabase copy exists ONLY so the
-- library has something to list (see the comment in api/admin/images/route.ts).
-- Once listing is a query against this table, that mirror has no job left.
--
-- Deliberately additive. Nothing reads this yet. It is filled by a reindex that
-- crawls what exists, and only once it agrees with the buckets does anything
-- start depending on it.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  -- The object key, identical in both stores ("memories/{edition}/foo.jpg").
  key text not null unique,
  -- Where the bytes actually are. Most rows are in both during the migration.
  in_r2 boolean not null default false,
  in_supabase boolean not null default false,
  kind text not null default 'photo' check (kind in ('photo', 'video', 'other')),
  mime text,
  bytes bigint,
  width integer,
  height integer,
  duration_s numeric,
  -- Videos carry a sibling poster; stored as a key, same as everything else.
  poster_key text,
  /* What the file IS, derived from its prefix once, here, instead of by every
     caller with its own regex: 'memories', 'trip_video', 'library',
     'product_dev', 'thumb', 'other'. */
  scope text not null default 'other',
  -- Provenance, where the path can tell us. Nullable and FK-less on purpose: a
  -- file must never be undeletable because a booking went away.
  edition_id uuid,
  booking_id uuid,
  -- Human metadata. The whole reason a catalogue beats a directory listing.
  alt text,
  caption text,
  tags text[] not null default '{}',
  -- Crawl bookkeeping: last time the reindex saw it, and when it first went
  -- missing. A row is never deleted by the crawl, only marked, so a bucket
  -- hiccup can't wipe the catalogue.
  seen_at timestamptz,
  missing_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_scope on public.media_assets (scope, created_at desc);
create index if not exists media_assets_edition on public.media_assets (edition_id) where edition_id is not null;
create index if not exists media_assets_booking on public.media_assets (booking_id) where booking_id is not null;
create index if not exists media_assets_live on public.media_assets (scope) where missing_since is null;

alter table public.media_assets enable row level security;
-- Service role only, like every other admin-owned table here. Member reads will
-- go through the routes that already gate by booking, never straight to this.
