-- ============================================================================
-- 145 — Every partner in one list, linked to the hotel it is.
--
-- Vendors held four rows. Sorobon — three Bonaire weeks, the single biggest
-- room supplier — was not among them, because hotels were being kept in the
-- `hotels` table (which is the product side: photos, description, location) and
-- nobody was also entering them as the commercial relationship they are. Two
-- lists of the same suppliers, drifting, and the cancellation terms recorded in
-- 144 sitting on whichever half you happened to open.
--
-- So: one link column, a backfill that matches the rows that already pair up,
-- and a vendor for every hotel that had none. The centers NP7 buys from
-- (Windcenter Playa Surf, ASPC Alaçatı) are partners too and were nowhere at
-- all — they are not hotels, so `hotels` was never going to hold them.
-- ============================================================================

alter table vendors
  add column if not exists hotel_id uuid references hotels(id);

comment on column vendors.hotel_id is
  'The hotel this vendor IS, when it is one. hotels holds the product side
   (photos, description, rooms); vendors holds the relationship (who we
   negotiate with, what we agreed). One supplier, one row each side, linked —
   so the cancellation terms are never recorded against the half you did not
   open.';

create index if not exists idx_vendors_hotel on vendors (hotel_id) where hotel_id is not null;

-- ── Link the pairs that already exist under slightly different names ────────
update vendors v set hotel_id = h.id
  from hotels h
 where v.hotel_id is null
   and h.archived_at is null
   and (
        (v.name ilike '%wanapa%'      and h.name ilike '%wanapa%')
     or (v.name ilike '%playa surf%'  and h.name ilike '%playa surf%')
     or (v.name ilike '%sorobon%'     and h.name ilike '%sorobon%')
     or (v.name ilike '%paradiso%'    and h.name ilike '%paradiso%')
   );

-- ── A vendor for every live hotel that has none ─────────────────────────────
-- category is text[] here (the admin form has been writing a bare string into
-- it, which is a separate bug fixed in the same commit) — so write real arrays.
insert into vendors (name, category, hotel_id, terms_status, notes)
select h.name, array['accommodation']::text[], h.id, 'todo',
       'Added automatically from Hotels — check the contact details.'
  from hotels h
 where h.archived_at is null
   and not exists (select 1 from vendors v where v.hotel_id = h.id and v.archived_at is null);

-- ── The centers. Not hotels, so they were never going to appear above. ─────
insert into vendors (name, category, terms_status, notes)
select x.name, array['center']::text[], 'todo', x.note
  from (values
    ('Windcenter Playa Surf', 'Tenerife — gear, launch and coaching base. Check the cancellation terms.'),
    ('ASPC Alaçatı',          'Alaçatı — gear, launch and coaching base. Check the cancellation terms.')
  ) as x(name, note)
 where not exists (
   select 1 from vendors v where v.archived_at is null and lower(v.name) = lower(x.name)
 );
