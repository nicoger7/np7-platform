-- Migration 034: Member notes on magazine spotguide spots
-- Logged-in members can submit a note about a spot; the team moderates, and
-- approved notes show as attributed "local notes" under that spot. Notes are
-- keyed to a post + spot name (spots live in exp_blog_posts.template_data JSON,
-- so there's no spot row to FK to).

create table if not exists exp_blog_spot_notes (
  id            uuid primary key default gen_random_uuid(),
  blog_post_id  uuid not null references exp_blog_posts(id) on delete cascade,
  spot_name     text not null,
  contact_id    uuid references contacts(id) on delete set null,
  author_name   text,
  body          text not null,
  status        text not null default 'pending', -- pending | approved | rejected
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists exp_blog_spot_notes_post_idx
  on exp_blog_spot_notes (blog_post_id, status);

alter table exp_blog_spot_notes enable row level security;

-- Public (anon) can read only approved notes — used on the public post page.
drop policy if exists "spot notes public read approved" on exp_blog_spot_notes;
create policy "spot notes public read approved"
  on exp_blog_spot_notes for select using (status = 'approved');

-- Team members (admin) get full access for moderation.
drop policy if exists "spot notes team all" on exp_blog_spot_notes;
create policy "spot notes team all"
  on exp_blog_spot_notes for all using (is_team_member()) with check (is_team_member());

-- A member may submit a pending note tied to their own contact. (Submissions
-- actually go through the service-role portal API, which bypasses RLS — this
-- policy is defense-in-depth.)
drop policy if exists "spot notes member insert" on exp_blog_spot_notes;
create policy "spot notes member insert"
  on exp_blog_spot_notes for insert with check (
    status = 'pending'
    and contact_id in (select id from contacts where auth_user_id = auth.uid())
  );
