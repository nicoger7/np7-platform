# Handoff: apply pending DB migrations (022, 023)

**For the agent with Supabase DB access** (project `qfdqigumjadvrocxjolx`).
Migrations 018–021 are applied. **022 and 023 are pending.** Committed on `dev` under
`supabase/migrations/`. Apply via the Management API
(`POST /v1/projects/qfdqigumjadvrocxjolx/database/query`) or psql, in order.

Both are additive-only and idempotent (`create table if not exists`, `add column if not exists`,
`drop policy if exists`). The app degrades gracefully until they're applied.

---

## 022 — destinations (`20260619_022_destinations.sql`)
Depends on existing `exp_experiences` + the `is_team_member()` function.

```sql
create table if not exists destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, region text, country text,
  hero_image text, tagline text, intro text,
  wind_probability text, wind_season text, wind_speed text,
  best_season text, conditions text, skill_levels text,
  gallery text[] not null default '{}',
  partners jsonb not null default '[]'::jsonb,
  status text not null default 'draft', sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table exp_experiences
  add column if not exists destination_id uuid references destinations(id) on delete set null;

alter table destinations enable row level security;
drop policy if exists "destinations public read" on destinations;
create policy "destinations public read" on destinations for select using (true);
drop policy if exists "destinations team write" on destinations;
create policy "destinations team write" on destinations for all using (is_team_member()) with check (is_team_member());
```

## 023 — event-page template + hotel media (`20260619_023_event_page_and_hotel_media.sql`)
Adds the per-experience page template, hotel photos/description, and a package→hotel link.
Until applied: the experience Template tab's template stays "full", and the public booking
"Accommodation" step shows no hotel name/photo (PATCH/POST routes strip the new fields and retry).

```sql
alter table exp_experiences add column if not exists page_template text not null default 'full';

alter table hotels add column if not exists image_url   text;
alter table hotels add column if not exists images      text[] default '{}';
alter table hotels add column if not exists description text;
alter table hotels add column if not exists website     text;

alter table exp_packages add column if not exists hotel_id uuid references hotels(id) on delete set null;
create index if not exists idx_exp_packages_hotel on exp_packages(hotel_id);
```

## 024 — member add-ons + photo downloads (`20260619_024_member_addons_downloads.sql`)
Caps the "download all photos" action (3×/booking) and adds a request/confirm flow to
`exp_booking_addons`. Until applied: downloads aren't capped, and member-requested add-ons
fall back gracefully (the routes tolerate the missing columns).

```sql
alter table exp_bookings add column if not exists memory_download_count int not null default 0;

alter table exp_booking_addons add column if not exists status       text not null default 'confirmed';
alter table exp_booking_addons add column if not exists source       text not null default 'admin';
alter table exp_booking_addons add column if not exists requested_at timestamptz;
alter table exp_booking_addons add column if not exists confirmed_at timestamptz;
```

## Verify
```sql
select count(*) from destinations;                  -- 022: table exists
select destination_id from exp_experiences limit 1; -- 022: column exists
select page_template from exp_experiences limit 1;  -- 023: column exists
select image_url, images, description from hotels limit 1; -- 023: hotel media
select hotel_id from exp_packages limit 1;          -- 023: package link
select memory_download_count from exp_bookings limit 1;    -- 024: download cap
select status, source from exp_booking_addons limit 1;     -- 024: add-on flow
```
Then: **Destinations** admin is live (022); the experience **Template** tab can pick a page template,
**Hotels** admin (`/admin/hotels`) can hold photos, and the public booking step shows the hotel name +
preview photo (link a package to a hotel in **Packages**, or rely on name auto-match) (023).
