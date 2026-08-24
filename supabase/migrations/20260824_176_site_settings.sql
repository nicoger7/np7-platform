-- Site-wide content knobs that belong to no single experience — first user:
-- the Experience-landing hero (video, poster, slow-connection fallback images).
-- Nothing on a public page may be hardcoded-only (Nico's standing rule); these
-- constants lived in code since the hero was built.
create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
-- The values are public page content (image/video URLs) — readable by anyone,
-- writable by the team.
create policy "site_settings public read" on site_settings for select using (true);
create policy "site_settings team write" on site_settings for all
  using (is_team_member()) with check (is_team_member());
