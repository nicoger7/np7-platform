-- Edition guides (reusable coach library + per-edition assignment/overrides)
-- and participant reviews (submission pool + admin-curated placements).
-- RLS mirrors exp_content (20260609_012): public select, team_member() write.

-- ============ Coaches ============
create table if not exists exp_coaches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text,
  bio        text,
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exp_edition_coaches (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references exp_editions(id) on delete cascade,
  coach_id       uuid not null references exp_coaches(id) on delete cascade,
  sort_order     int  not null default 0,
  name_override  text,
  role_override  text,
  bio_override   text,
  image_override text,
  created_at     timestamptz not null default now(),
  unique (edition_id, coach_id)
);
create index if not exists idx_edition_coaches_edition on exp_edition_coaches(edition_id);

alter table exp_coaches         enable row level security;
alter table exp_edition_coaches enable row level security;

drop policy if exists "exp_coaches public read" on exp_coaches;
create policy "exp_coaches public read" on exp_coaches for select using (true);
drop policy if exists "exp_coaches team write" on exp_coaches;
create policy "exp_coaches team write" on exp_coaches for all using (is_team_member()) with check (is_team_member());

drop policy if exists "exp_edition_coaches public read" on exp_edition_coaches;
create policy "exp_edition_coaches public read" on exp_edition_coaches for select using (true);
drop policy if exists "exp_edition_coaches team write" on exp_edition_coaches;
create policy "exp_edition_coaches team write" on exp_edition_coaches for all using (is_team_member()) with check (is_team_member());

-- ============ Reviews ============
create table if not exists exp_reviews (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid references exp_bookings(id)     on delete set null,
  experience_id   uuid references exp_experiences(id)  on delete set null,
  edition_id      uuid references exp_editions(id)     on delete set null,
  author_name     text,
  author_country  text,
  rating          int check (rating between 1 and 5),
  quote           text,
  photo_url       text,
  status          text not null default 'pending', -- pending | approved | hidden
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_reviews_status on exp_reviews(status);

create table if not exists exp_review_placements (
  id            uuid primary key default gen_random_uuid(),
  review_id     uuid not null references exp_reviews(id)      on delete cascade,
  experience_id uuid not null references exp_experiences(id)  on delete cascade,
  edition_id    uuid references exp_editions(id)             on delete set null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_review_placements_exp on exp_review_placements(experience_id);

alter table exp_reviews           enable row level security;
alter table exp_review_placements enable row level security;

drop policy if exists "exp_reviews public read" on exp_reviews;
create policy "exp_reviews public read" on exp_reviews for select using (status = 'approved');
drop policy if exists "exp_reviews team write" on exp_reviews;
create policy "exp_reviews team write" on exp_reviews for all using (is_team_member()) with check (is_team_member());

drop policy if exists "exp_review_placements public read" on exp_review_placements;
create policy "exp_review_placements public read" on exp_review_placements for select using (true);
drop policy if exists "exp_review_placements team write" on exp_review_placements;
create policy "exp_review_placements team write" on exp_review_placements for all using (is_team_member()) with check (is_team_member());
