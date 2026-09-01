-- ============================================================================
-- 199 — A windsurf center is a place, not just an invoice address.
--
-- The center is where the week actually happens: rigging, launching, storage,
-- every coaching session. It was being typed TWICE and stored in neither place
-- properly:
--
--   1. `vendors` — the commercial record (who we negotiate with, cancellation
--      terms). Right for a contract, useless to the website: no photo, no
--      description, no destination.
--   2. `destinations.partners` — a free-text JSONB array whose cards the public
--      "Local partners" grid renders. Right for the website, invisible to
--      operations, and hand-typed per destination.
--
-- So the two never agreed, and the ASPC → Sun Surf Alaçatı rename meant hunting
-- through JSON to finish a rename that had already happened on the vendor row.
--
-- Hotels do not have this problem: `hotels` is a real table (name, photos,
-- description, maps link) that the destination page pulls automatically, and
-- 145 linked each hotel to the vendor it IS. Centers get exactly that shape —
-- the same columns, the same public-read RLS, the same vendor link — plus an
-- explicit `destination_id`, because a hotel reaches its destination through
-- the packages that sell its rooms and a center sells no packages at all.
--
-- Re-runnable.
-- ============================================================================

-- ── 1. The table ────────────────────────────────────────────────────────────
create table if not exists centers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  prefix         text,
  location       text,
  description    text,
  website        text,
  image_url      text,
  images         text[] default '{}',
  maps_url       text,
  notes          text,
  destination_id uuid references destinations(id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

comment on table centers is
  'The windsurf station a week is run from — the product side of it: name,
   photos, description, where it is. The commercial side (contact, cancellation
   terms) stays on the matching `vendors` row, linked by vendors.center_id.';
comment on column centers.destination_id is
  'Where this center is. Explicit, unlike a hotel: hotels reach a destination
   through the packages that sell their rooms, and a center sells no packages,
   so nothing else in the schema knows which coast it sits on.';
comment on column centers.maps_url is
  'Optional map link. Empty is fine — the same fallback as hotels applies:
   a Maps search built from name + location is usually right.';

create index if not exists idx_centers_destination on centers (destination_id) where destination_id is not null;

-- Same posture as `hotels`: the website reads this table with the anon key, so
-- SELECT is open; every write goes through a service-role admin route, which
-- bypasses RLS. No write policy is therefore the CLOSED state, not a gap — see
-- 197 for what happens when a "service role may do everything" policy is added
-- and quietly grants it to `public` instead.
alter table centers enable row level security;
drop policy if exists public_read_centers on centers;
create policy public_read_centers on centers for select using (true);

-- ── 2. The vendor link, mirroring vendors.hotel_id from 145 ─────────────────
alter table vendors
  add column if not exists center_id uuid references centers(id);

comment on column vendors.center_id is
  'The center this vendor IS, when it is one — the twin of hotel_id. One
   supplier, one row each side, linked, so a rename or a cancellation term is
   never recorded against the half you did not open.';

create index if not exists idx_vendors_center on vendors (center_id) where center_id is not null;

-- ── 3. Seed the three that already exist — retyping nothing ─────────────────
-- The name comes from the vendor row (that is where the ASPC → Sun Surf rename
-- landed); the photo, description and link come from the destination's partner
-- card, read out of the JSON rather than pasted back in. `card_name` differs
-- from `name` on two of them precisely because the two lists had drifted.
insert into centers (name, destination_id, location, website, image_url, description)
select x.name,
       d.id,
       nullif(concat_ws(', ', d.name, d.country), ''),
       nullif(card.p->>'url', ''),
       nullif(card.p->>'image', ''),
       nullif(card.p->>'description', '')
  from (values
    ('Sun Surf Alaçatı',      'alacati',  'Sun Surf Alaçatı'),
    ('Jibe City',             'bonaire',  'Jibe City Center'),
    ('Windcenter Playa Surf', 'tenerife', 'Wind Center Playa Surf')
  ) as x(name, dest_slug, card_name)
  join destinations d on d.slug = x.dest_slug
  left join lateral (
    select el as p
      from jsonb_array_elements(coalesce(d.partners, '[]'::jsonb)) as el
     where el->>'name' = x.card_name
     limit 1
  ) card on true
 where not exists (
   select 1 from centers c where lower(c.name) = lower(x.name)
 );

update vendors v
   set center_id = c.id
  from centers c
 where v.center_id is null
   and v.archived_at is null
   and c.archived_at is null
   and lower(v.name) = lower(c.name);

-- ── 4. Take the three center cards out of the hand-typed list ───────────────
-- They are auto-pulled from `centers` now, so leaving them would print each one
-- twice. Only these three names go: SÖRF Garden and Hang Out Beach Bar are a
-- restaurant and a beach bar, they are not centers, and the partners list stays
-- exactly where they belong.
update destinations d
   set partners = coalesce(
         (select jsonb_agg(el order by ord)
            from jsonb_array_elements(d.partners) with ordinality as t(el, ord)
           where el->>'name' not in ('Sun Surf Alaçatı', 'Jibe City Center', 'Wind Center Playa Surf')),
         '[]'::jsonb)
 where d.slug in ('alacati', 'bonaire', 'tenerife')
   and d.partners is not null
   and exists (
     select 1 from jsonb_array_elements(d.partners) as el
      where el->>'name' in ('Sun Surf Alaçatı', 'Jibe City Center', 'Wind Center Playa Surf')
   );
