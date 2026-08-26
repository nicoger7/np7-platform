-- 183: real booking notes — entries with author + timestamp, checkable and
-- strikeable, in their own Bookings sub-tab. The legacy exp_bookings.notes
-- free-text column stays (system flows write it: registration, standby,
-- cancellations) and renders as the pinned "System" block in the same tab.
create table if not exists exp_booking_notes (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references exp_bookings(id) on delete cascade,
  body       text not null,
  author     text,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  struck_at  timestamptz
);
alter table exp_booking_notes enable row level security;
create policy "booking notes team" on exp_booking_notes
  for all using (is_team_member()) with check (is_team_member());
create index if not exists idx_booking_notes_booking on exp_booking_notes(booking_id);
