-- Destinations: a standalone content model for windsurf-travel locations
-- (modelled on surfcenter-experience.com/destinations). Bidirectional with
-- experiences via exp_experiences.destination_id. RLS mirrors exp_content.
-- Idempotent. MANUAL apply.

create table if not exists destinations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique,
  region           text,
  country          text,
  hero_image       text,
  tagline          text,
  intro            text,
  wind_probability text,            -- e.g. "80–90%"
  wind_season      text,            -- e.g. "May–October"
  wind_speed       text,            -- e.g. "15–25 kn, gusts to 30"
  best_season      text,
  conditions       text,
  skill_levels     text,            -- e.g. "All levels"
  gallery          text[]  not null default '{}',
  partners         jsonb   not null default '[]'::jsonb,  -- [{ name, description, url }]
  status           text    not null default 'draft',      -- draft | published | archived
  sort_order       int     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table exp_experiences
  add column if not exists destination_id uuid references destinations(id) on delete set null;

alter table destinations enable row level security;
drop policy if exists "destinations public read" on destinations;
create policy "destinations public read" on destinations for select using (true);
drop policy if exists "destinations team write" on destinations;
create policy "destinations team write" on destinations for all using (is_team_member()) with check (is_team_member());
