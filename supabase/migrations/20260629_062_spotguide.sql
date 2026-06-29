-- Migration 062: Spotguide — first-class, member-interactive spots
-- ─────────────────────────────────────────────────────────────────────────
-- Rebuilds the magazine spotguide. Previously a spot was a blob of JSON inside
-- a blog post (exp_blog_posts.template_data.spots) — so it could carry no
-- rating average, no verification state, and members couldn't add one. This
-- promotes SPOTS to real rows under the existing `destinations` table and adds:
--   • two rating tracks per criterion: NP7 (editorial) + member (averaged)
--   • a crowd-voted "best forecast model" per spot (like the windrose)
--   • a verification ladder: pending → community (K member confirms) → np7
-- Reuses the `destinations` table as the trip/area layer (DRY) and the
-- spot-notes / reviews moderation pattern (status + is_team_member RLS).
--
-- Additive + idempotent — safe to paste into the Supabase SQL editor.
-- Levels (spots.level, destinations.level_min/max) reference the SAME taxonomy
-- as the member system (src/lib/member-level.ts LEVELS) — one source of truth.

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · Destinations: rating track + level range + spotguide visibility + coords
--     (the destination is the whole-trip unit; rated separately from its spots)
-- ─────────────────────────────────────────────────────────────────────────
alter table destinations
  add column if not exists np7_ratings      jsonb not null default '{}'::jsonb,   -- { wind, stay_food, no_wind_days, family, value, vibe } each 1–5
  add column if not exists level_min         text,                                -- LEVELS value, e.g. 'Beginner'
  add column if not exists level_max         text,                                -- LEVELS value, e.g. 'Advanced'
  add column if not exists spotguide_status  text not null default 'draft',       -- draft | published — INDEPENDENT of the marketing `status`
  add column if not exists lat               double precision,
  add column if not exists lng               double precision;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · Spots — the launch you actually rig & sail at (many per destination)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spots (
  id                  uuid primary key default gen_random_uuid(),
  destination_id      uuid not null references destinations(id) on delete cascade,
  name                text not null,
  slug                text,                                  -- unique within a destination
  lat                 double precision,
  lng                 double precision,
  -- facts (objective)
  level               text,                                  -- single LEVELS value
  conditions          text[] not null default '{}',          -- flat | chop | waves | mixed  (absorbs old "water type")
  wind_window         jsonb  not null default '{}'::jsonb,    -- windrose: { N:'best'|'good'|'no', NE:…, … }
  infrastructure      text[] not null default '{}',          -- tags: school, rental, bar, parking…
  np7_forecast_models text[] not null default '{}',          -- NP7's recommended forecast model(s)
  wind_stats          jsonb,                                 -- Open-Meteo climatology cache (Phase 4)
  wind_stats_at       timestamptz,
  -- content
  hero_image          text,
  gallery             text[] not null default '{}',
  summary             text,
  description         text,
  -- NP7 editorial rating (member ratings live in spot_ratings, averaged)
  np7_ratings         jsonb  not null default '{}'::jsonb,    -- { wind, conditions, safety, beauty, infrastructure, family } each 1–5
  -- provenance + lifecycle
  source              text   not null default 'np7',          -- np7 | member
  submitted_by        uuid references contacts(id) on delete set null,
  status              text   not null default 'draft',        -- draft | published | hidden
  verification        text   not null default 'np7',          -- pending | community | np7
  sort_order          int    not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists spots_dest_slug_idx on spots (destination_id, slug);
create index if not exists spots_dest_idx     on spots (destination_id, status);
create index if not exists spots_verif_idx    on spots (verification);
create index if not exists spots_submitter_idx on spots (submitted_by);

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · Member ratings (one row per member per spot / destination, upserted)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spot_ratings (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references spots(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  ratings     jsonb not null default '{}'::jsonb,     -- { wind, conditions, safety, beauty, infrastructure, family }
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (spot_id, contact_id)
);
create index if not exists spot_ratings_spot_idx on spot_ratings (spot_id);

create table if not exists destination_ratings (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  ratings        jsonb not null default '{}'::jsonb,  -- { wind, stay_food, no_wind_days, family, value, vibe }
  comment        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (destination_id, contact_id)
);
create index if not exists destination_ratings_dest_idx on destination_ratings (destination_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · Crowd-voted best forecast model (one favourite per member per spot).
--     The public graphic colours/sizes models by vote share — most-voted =
--     "most likely correct here".
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spot_forecast_votes (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references spots(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  model       text not null,
  created_at  timestamptz not null default now(),
  unique (spot_id, contact_id)
);
create index if not exists spot_forecast_votes_spot_idx on spot_forecast_votes (spot_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · Cross-member verification — "I've sailed here, this is accurate".
--     K confirms (default 3, enforced in app code) flips a pending member spot
--     to verification='community'. `flag` lets the crowd self-correct.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spot_verifications (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references spots(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  kind        text not null default 'confirm',  -- confirm | flag
  note        text,
  created_at  timestamptz not null default now(),
  unique (spot_id, contact_id)
);
create index if not exists spot_verifications_spot_idx on spot_verifications (spot_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6 · Spot photos — NP7 gallery + member submissions (moderated before public)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists spot_photos (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid not null references spots(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  url         text not null,
  caption     text,
  source      text not null default 'member',   -- np7 | member
  status      text not null default 'pending',  -- pending | approved | rejected
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (spot_id, url)
);
create index if not exists spot_photos_spot_idx on spot_photos (spot_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — mirrors destinations / exp_reviews: public read of what's live, team
-- full access. Member writes go through service-role portal APIs (which bypass
-- RLS); the member policies below are defense-in-depth.
-- ─────────────────────────────────────────────────────────────────────────
alter table spots               enable row level security;
alter table spot_ratings        enable row level security;
alter table destination_ratings enable row level security;
alter table spot_forecast_votes enable row level security;
alter table spot_verifications  enable row level security;
alter table spot_photos         enable row level security;

-- Spots: anon sees only published + verified (community/np7); team sees all.
drop policy if exists "spots public read" on spots;
create policy "spots public read" on spots for select
  using (status = 'published' and verification in ('community', 'np7'));
drop policy if exists "spots team all" on spots;
create policy "spots team all" on spots for all using (is_team_member()) with check (is_team_member());

-- Ratings / votes / verifications: team full; a member may write their own row.
do $$
declare t text;
begin
  foreach t in array array['spot_ratings','destination_ratings','spot_forecast_votes','spot_verifications']
  loop
    execute format('drop policy if exists "%1$s team all" on %1$s', t);
    execute format('create policy "%1$s team all" on %1$s for all using (is_team_member()) with check (is_team_member())', t);
    execute format('drop policy if exists "%1$s member write" on %1$s', t);
    execute format($f$create policy "%1$s member write" on %1$s for all
      using (contact_id in (select id from contacts where auth_user_id = auth.uid()))
      with check (contact_id in (select id from contacts where auth_user_id = auth.uid()))$f$, t);
  end loop;
end $$;

-- Spot photos: anon reads approved; team full; member inserts their own pending.
drop policy if exists "spot_photos public read" on spot_photos;
create policy "spot_photos public read" on spot_photos for select using (status = 'approved');
drop policy if exists "spot_photos team all" on spot_photos;
create policy "spot_photos team all" on spot_photos for all using (is_team_member()) with check (is_team_member());
drop policy if exists "spot_photos member insert" on spot_photos;
create policy "spot_photos member insert" on spot_photos for insert with check (
  status = 'pending' and contact_id in (select id from contacts where auth_user_id = auth.uid())
);
