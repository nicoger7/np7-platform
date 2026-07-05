-- Migration 064: member-moderated spot photos (auto-show + up/down-votes + flag)
-- ─────────────────────────────────────────────────────────────────────────
-- A member's photo now appears immediately (the upload API sets status
-- 'approved'). Members up/down-vote photos — the gallery sorts best-first — and
-- can flag one; a few flags auto-hide it (status 'hidden') for NP7 to review.
-- One reaction row per member per photo (their vote + whether they flagged it).
-- Additive + idempotent.

create table if not exists spot_photo_votes (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references spot_photos(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  value       smallint not null default 0,     -- -1 | 0 | +1
  flagged     boolean  not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (photo_id, contact_id)
);
create index if not exists spot_photo_votes_photo_idx on spot_photo_votes (photo_id);

alter table spot_photo_votes enable row level security;
drop policy if exists "spot_photo_votes team all" on spot_photo_votes;
create policy "spot_photo_votes team all" on spot_photo_votes for all using (is_team_member()) with check (is_team_member());
drop policy if exists "spot_photo_votes member write" on spot_photo_votes;
create policy "spot_photo_votes member write" on spot_photo_votes for all
  using (contact_id in (select id from contacts where auth_user_id = auth.uid()))
  with check (contact_id in (select id from contacts where auth_user_id = auth.uid()));
