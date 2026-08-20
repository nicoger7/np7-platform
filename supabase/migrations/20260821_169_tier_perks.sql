-- Loyalty-tier perks (Rider/Crew/Legend): defined per EXPERIENCE, optionally
-- narrowed to an edition, optionally overridden per package (a package row
-- wins over broader rows — including down to 0 for packages a perk must not
-- touch). First perk: Crew+Legend −5% on every Alaçatı 2027 package.
create table if not exists exp_tier_perks (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references exp_experiences(id) on delete cascade,
  edition_id uuid references exp_editions(id) on delete cascade,
  package_id uuid references exp_packages(id) on delete cascade,
  tier text not null check (tier in ('rider','crew','legend')),
  kind text not null default 'discount_pct',
  value numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table exp_tier_perks enable row level security;
-- The public page (anon key) prices packages for the signed-in member; a 5%
-- crew perk is marketing, not a secret. Writes stay service-role only.
do $do$ begin
  if not exists (select 1 from pg_policies where tablename='exp_tier_perks' and policyname='Public can view active tier perks') then
    create policy "Public can view active tier perks" on exp_tier_perks for select using (active = true);
  end if;
end $do$;
