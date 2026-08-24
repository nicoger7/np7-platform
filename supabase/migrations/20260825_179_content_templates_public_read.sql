-- content_templates had RLS enabled and ZERO policies — the public pages'
-- anon reads returned empty, so every templated section silently fell back
-- to hardcoded defaults. Template edits never reached the website; the admin
-- (service role) saw them fine, which is why nobody noticed. Templates are
-- public page copy — world-readable, team-writable.
alter table content_templates enable row level security;
drop policy if exists "content_templates public read" on content_templates;
create policy "content_templates public read" on content_templates for select using (true);
drop policy if exists "content_templates team write" on content_templates;
create policy "content_templates team write" on content_templates for all
  using (is_team_member()) with check (is_team_member());
