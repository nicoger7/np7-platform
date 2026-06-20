-- Migration 012: Experience website content
-- Per-experience narrative content shown on the public experience pages
-- (about the location, about the week, daily program, highlights, FAQ).
-- Kept separate from exp_experiences (operations data) so the website content
-- layer can evolve independently and extend to an edition-level layer later.

create table if not exists exp_content (
  id            uuid primary key default gen_random_uuid(),
  experience_id uuid not null unique references exp_experiences(id) on delete cascade,
  location_about text,                        -- about the windsurf spot / destination
  week_info      text,                        -- additional info about the week
  daily_program  jsonb  not null default '[]'::jsonb,  -- [{ "title": "...", "description": "..." }]
  highlights     text[] not null default '{}',         -- "why this trip" bullets
  faq            jsonb  not null default '[]'::jsonb,   -- [{ "q": "...", "a": "..." }]
  updated_at     timestamptz default now()
);

create index if not exists exp_content_experience_id_idx on exp_content(experience_id);

alter table exp_content enable row level security;

-- Public (anon) read — the front-end uses the anon client, matching
-- exp_experiences / exp_editions / exp_packages public-read policies.
drop policy if exists "exp_content public read" on exp_content;
create policy "exp_content public read" on exp_content for select using (true);

-- Writes happen only through the admin API (service role bypasses RLS),
-- so there is intentionally no anon insert/update/delete policy.
-- Team members (authenticated) also get full access via the shared helper.
drop policy if exists "exp_content team write" on exp_content;
create policy "exp_content team write" on exp_content
  for all using (is_team_member()) with check (is_team_member());
