-- Member verification for rider-proposed destinations (areas), mirroring
-- spot_verifications: 3 member confirms (or a local/moderator, or NP7)
-- publish the area. Solves the chicken-and-egg where a spot in a new area
-- couldn't collect verifications because the draft area page 404'd.
create table if not exists destination_verifications (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references destinations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('confirm','flag')),
  note text,
  created_at timestamptz not null default now(),
  unique (destination_id, contact_id)
);
alter table destination_verifications enable row level security;
