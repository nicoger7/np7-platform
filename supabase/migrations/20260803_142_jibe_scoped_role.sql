-- 142 · A key for jibe that CANNOT break anything.
--
-- jibe ran on the service_role key: full bypass of RLS on every table —
-- bookings, contacts, payments — held by an autonomous agent firing every 15
-- minutes. Its good behaviour was the only fence. This role makes the fence
-- structural: jibe can read its queues and reference tables, insert DRAFTS,
-- and close queue rows. Nothing else. The interesting part is that the RLS
-- policies encode the editorial rules themselves — jibe cannot insert a
-- published spot or post even if it tries, because the database refuses.
create role jibe_agent login password '<set at creation — see the credentials note>'
  nosuperuser nocreatedb nocreaterole noinherit connection limit 4;

grant usage on schema public to jibe_agent;

-- read what it needs to match against; write only what the brief allows
grant select on spot_intake_queue, blog_intake_queue, spots, destinations, spot_edits, exp_blog_posts to jibe_agent;
grant insert on spots, destinations, spot_edits, exp_blog_posts to jibe_agent;
grant update (status, spot_id, destination_id, notes, processed_at) on spot_intake_queue to jibe_agent;
grant update (status, post_id, notes, processed_at) on blog_intake_queue to jibe_agent;

-- RLS: policies per command, and the WITH CHECKs are the brief, enforced.
create policy jibe_read_spot_q  on spot_intake_queue for select to jibe_agent using (true);
create policy jibe_close_spot_q on spot_intake_queue for update to jibe_agent
  using (true) with check (status in ('processed','discarded'));
create policy jibe_read_blog_q  on blog_intake_queue for select to jibe_agent using (true);
create policy jibe_close_blog_q on blog_intake_queue for update to jibe_agent
  using (true) with check (status in ('processed','discarded'));

create policy jibe_read_spots on spots for select to jibe_agent using (true);
create policy jibe_draft_spots on spots for insert to jibe_agent
  with check (status = 'draft' and source = 'jibe' and verification = 'pending');

create policy jibe_read_dests on destinations for select to jibe_agent using (true);
create policy jibe_draft_dests on destinations for insert to jibe_agent
  with check (spotguide_status = 'draft');

create policy jibe_read_edits on spot_edits for select to jibe_agent using (true);
create policy jibe_propose_edits on spot_edits for insert to jibe_agent
  with check (source = 'jibe' and status = 'pending' and contact_id is null);

create policy jibe_read_posts on exp_blog_posts for select to jibe_agent using (true);
create policy jibe_draft_posts on exp_blog_posts for insert to jibe_agent
  with check (status = 'draft' and published_at is null);
