-- 1) Which package components appear in the website's "What's included" list
--    (their display text = exp_components.description, the component's Website text).
alter table exp_package_components add column if not exists show_on_website boolean not null default false;

-- 2) Rooms assigned to a package — the package's availability derives from how
--    many physical rooms back it.
create table if not exists exp_package_rooms (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references exp_packages(id) on delete cascade,
  room_id uuid not null references exp_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (package_id, room_id)
);
create index if not exists exp_package_rooms_package_idx on exp_package_rooms(package_id);
alter table exp_package_rooms enable row level security; -- zero policies: service-role only
