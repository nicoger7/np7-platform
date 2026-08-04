-- ============================================================================
-- 143 — Capacity: two pools, one answer.
--
-- A package can only be sold if BOTH have room: the week (max_spots — coaches,
-- boat, group size) and the hotel (the beds we actually hold). Packages with no
-- hotel are limited by the week alone. Today neither is enforced and neither is
-- even computed consistently: exp_editions.spots_taken has no writer and reads
-- 3 where the truth is 21, and four bits of TypeScript each define "this
-- booking holds a spot" slightly differently.
--
-- Nothing here counts and stores. Every number is derived on read, so a
-- cancellation frees its spot AND its bed with zero writes, and the hotel
-- taking a room back changes every figure on the next render.
--
-- Undeclared is not decided. A pool with no rooms entered constrains nothing
-- (NULL); a room whose bed count nobody has set makes its whole pool NULL
-- rather than guessing. Both surface as gaps in the launch check instead of
-- silently taking live weeks off sale.
-- ============================================================================

-- ─────────────────────────────────────────────────────────── columns ──────

-- The one number the schema has never had. No capacity/sleeps/beds column
-- exists anywhere, which is why "5 rooms" has been treated as 5 spots — wrong
-- for every hotel NP7 uses. It lives on the physical room (set once, 44 rows),
-- not the week row (120 rows).
alter table exp_rooms
  add column if not exists hotel_id uuid references hotels(id),
  add column if not exists sleeps   int;

do $$ begin
  alter table exp_rooms add constraint exp_rooms_sleeps_positive
    check (sleeps is null or sleeps > 0);
exception when duplicate_object then null; end $$;

comment on column exp_rooms.sleeps is
  'How many people this physical room takes. NULL = nobody has said: its pool
   returns NULL (constrains nothing) rather than a guessed number, and the
   launch check asks for it.';
comment on column exp_rooms.hotel_id is
  'The real hotel. exp_rooms.hotel is legacy free text ("REF") that no longer
   matches hotels.name ("REF Carsi"), so matching on it forked a duplicate
   physical room on every save — and duplicate rooms double the bed count.';

-- Backfill from the week rows, which already carry hotel_id on every row.
-- Only where unambiguous: a room that has appeared under two hotels is left
-- for a human.
update exp_rooms r
   set hotel_id = s.hotel_id
  from (select room_id, (array_agg(distinct hotel_id))[1] as hotel_id
          from exp_hotel_rooms
         where room_id is not null and hotel_id is not null
         group by room_id
        having count(distinct hotel_id) = 1) s
 where s.room_id = r.id and r.hotel_id is null;

-- "The hotel resold this one." Only ever an UNSOLD room: once a guest books,
-- NP7 blocks the room at the hotel, so a sold room cannot be pulled. Kept
-- orthogonal to status, which also carries assignment.
alter table exp_hotel_rooms
  add column if not exists released_at     timestamptz,
  add column if not exists released_reason text;

comment on column exp_hotel_rooms.released_at is
  'Set when the room leaves our allotment. It drops out of every bed count
   immediately. Only valid on an unassigned room — a room with a guest in it is
   blocked at the hotel and cannot be taken back.';

-- LIVE BUG. This CHECK lists seven legacy nicknames (Sorobon, REF, REF II …)
-- while both room editors write hotels.name (Sorobon Beach Resort, REF Carsi).
-- Not one active hotel passes, so saving a room after touching the Hotel
-- dropdown fails outright. The column stays — the Notion sync still writes it —
-- but nothing reads it for identity any more.
alter table exp_hotel_rooms drop constraint if exists exp_hotel_rooms_hotel_check;

-- How a package draws on rooms. room_type is the pool key rather than the whole
-- hotel: Bonaire Week I sells six distinct room types across two hotels as
-- fourteen packages, so "the Sorobon pool" would count Ocean Front Beach Houses
-- against a Garden View Studio package.
alter table exp_packages
  add column if not exists room_type        text,
  add column if not exists beds_per_booking int not null default 1;

do $$ begin
  alter table exp_packages add constraint exp_packages_beds_per_booking_check
    check (beds_per_booking between 1 and 8);
exception when duplicate_object then null; end $$;

comment on column exp_packages.room_type is
  'Which room type at hotel_id this package sells. NULL with a hotel set = pool
   not declared yet, so rooms do not limit it. Explicit exp_package_rooms links
   win over this when present.';
comment on column exp_packages.beds_per_booking is
  '1 = the guest shares the room. 2 = the sale takes the whole room (a double
   sold for single use — Playa Surf "All Inclusive – Single Room"), so it
   competes with the Double Room package for the same physical doubles.';
comment on column exp_packages.max_spots is
  'ALLOCATION: an optional ceiling on this package''s share of the week, so one
   package cannot eat the whole trip. NOT the room limit — that is derived and
   must never be typed, because it changes without NP7 touching anything.';

create index if not exists idx_exp_hotel_rooms_pool
  on exp_hotel_rooms (edition_id, hotel_id, room_type)
  where archived_at is null and released_at is null;

-- ─────────────────────────────────────────────────────── the one rule ─────

-- Replaces four divergent TypeScript copies. Mirrors lib/availability.ts
-- exactly: lost is tested FIRST because a cancelled booking keeps its payment
-- flags (the refund history lives on them) and would otherwise hold its spot
-- for ever.
create or replace view exp_secured_bookings with (security_invoker = on) as
select b.*
  from exp_bookings b
 where b.status is distinct from 'lost'
   and ( b.downpayment_received
      or b.final_payment_received
      or b.status in ('confirmed','paid','attended') );

-- ────────────────────────────────────────────────── the bed inventory ─────

-- One row per PHYSICAL room per edition — not per week-row. A couple booked as
-- two separate bookings is the most ordinary transaction in this business, and
-- the Rooms form is shaped to produce two week-rows for it, both resolving to
-- the same exp_rooms id. Counting rows would report four beds in a two-bed
-- double.
create or replace view exp_room_pool_units with (security_invoker = on) as
with live as (
  select r.id, r.edition_id, r.hotel_id, r.room_type, r.name, r.room_id,
         coalesce(r.room_id, r.id) as unit_id,
         r.released_at, r.booking_id, r.extra_booking_ids, r.partner_tag_along
    from exp_hotel_rooms r
   where r.archived_at is null
     and r.edition_id is not null
),
-- Distinct occupants across every row of the unit, so a room entered twice
-- does not count its guest twice.
occupants as (
  select distinct l.edition_id, l.unit_id, b.id as booking_id,
         coalesce(p.beds_per_booking, 1) as beds
    from live l
    join exp_bookings b
      on b.id = l.booking_id
      or b.id = any(coalesce(l.extra_booking_ids, '{}'::uuid[]))
    left join exp_packages p on p.id = b.package_id
   where b.status is distinct from 'lost'
),
used as (
  select edition_id, unit_id, sum(beds)::int as beds
    from occupants group by 1, 2
),
-- A partner just tagging along takes a BED but no SPOT — they have no booking.
-- Twelve live rooms have one today.
tagalongs as (
  select edition_id, unit_id, count(distinct btrim(partner_tag_along))::int as n
    from live
   where nullif(btrim(coalesce(partner_tag_along, '')), '') is not null
   group by 1, 2
)
select l.edition_id,
       l.unit_id,
       (array_agg(l.hotel_id)  filter (where l.hotel_id  is not null))[1] as hotel_id,
       (array_agg(l.room_type) filter (where l.room_type is not null))[1] as room_type,
       (array_agg(l.name))[1]                                            as name,
       count(*)::int                                                     as rows_merged,
       bool_and(l.released_at is not null)                               as released,
       max(rm.sleeps)                                                    as beds,
       (max(rm.sleeps) is null)                                          as beds_unknown,
       (coalesce(u.beds, 0) + coalesce(t.n, 0))::int                     as beds_used,
       case when max(rm.sleeps) is null then null
            else greatest(0, max(rm.sleeps) - (coalesce(u.beds, 0) + coalesce(t.n, 0)))
       end                                                               as beds_free,
       -- More people in the room than it sleeps. Not clamped away: an
       -- overloaded room is a thing an operator has to see.
       case when max(rm.sleeps) is null then 0
            else greatest(0, (coalesce(u.beds, 0) + coalesce(t.n, 0)) - max(rm.sleeps))
       end                                                               as beds_over
  from live l
  left join exp_rooms rm on rm.id = l.room_id
  left join used      u  on u.edition_id = l.edition_id and u.unit_id = l.unit_id
  left join tagalongs t  on t.edition_id = l.edition_id and t.unit_id = l.unit_id
 group by l.edition_id, l.unit_id, u.beds, t.n;

-- ──────────────────────────────────────────────── the pool per package ────

-- Pool resolution, in order: explicit room links → room type at the package's
-- hotel → nothing (undeclared, so rooms do not limit it).
create or replace view exp_package_room_pool with (security_invoker = on) as
with pkg as (
  select p.id, p.hotel_id, p.room_type, p.beds_per_booking,
         exists (select 1 from exp_package_rooms pr where pr.package_id = p.id) as has_links
    from exp_packages p
   where p.archived_at is null
),
matched as (
  select pk.id as package_id, pk.beds_per_booking, u.*
    from pkg pk
    join exp_room_pool_units u
      on ( pk.has_links
           and u.unit_id in (select pr.room_id from exp_package_rooms pr
                              where pr.package_id = pk.id and pr.room_id is not null) )
      or ( not pk.has_links
           and pk.hotel_id is not null and pk.room_type is not null
           and u.hotel_id = pk.hotel_id and u.room_type = pk.room_type )
)
select package_id,
       edition_id,
       count(*) filter (where not released)::int              as rooms,
       count(*)::int                                          as rooms_ever,
       sum(beds)      filter (where not released)::int        as beds_total,
       sum(beds_used) filter (where not released)::int        as beds_used,
       sum(beds_free) filter (where not released)::int        as beds_free,
       sum(beds_over) filter (where not released)::int        as beds_over,
       coalesce(bool_or(beds_unknown) filter (where not released), false) as beds_unknown,
       case
         -- Every room we held here is gone. That is FULL, not unlimited — the
         -- whole point of being able to record a release.
         when count(*) filter (where not released) = 0                     then 0
         -- One unknown bed count and the pool cannot be trusted at all.
         when bool_or(beds_unknown) filter (where not released)            then null
         -- Per-room FLOOR, then SUM. You cannot assemble sole occupancy of a
         -- double out of one spare bed here and one spare bed there.
         else sum(floor(beds_free::numeric / greatest(beds_per_booking, 1)))
                filter (where not released)::int
       end                                                    as sellable
  from matched
 group by 1, 2;

-- ──────────────────────────────────────────────── the pool per edition ────

create or replace view exp_edition_pool with (security_invoker = on) as
select e.id as edition_id,
       e.experience_id,
       e.max_spots                            as cap,
       coalesce(s.used, 0)::int               as used,
       case when e.max_spots is null then null
            else greatest(0, e.max_spots - coalesce(s.used, 0)) end as free,
       -- Un-clamped, for admin only: "6 OVER a cap of 10" is the sentence that
       -- tells you the cap is stale.
       greatest(0, coalesce(s.used, 0) - coalesce(e.max_spots, coalesce(s.used, 0)))::int
                                              as over_cap
  from exp_editions e
  left join (select edition_id, count(*) as used
               from exp_secured_bookings
              where edition_id is not null
              group by edition_id) s on s.edition_id = e.id
 where e.archived_at is null;

-- ────────────────────────────────────────────────────────── the answer ────

-- LEAST() ignores NULLs and returns NULL only when every argument is NULL. That
-- single property is why a package with no hotel needs no special case
-- anywhere: its room limit is NULL, so the week is what limits it.
create or replace view exp_package_availability with (security_invoker = on) as
with pkg_edition as (
  select p.id as package_id, e.id as edition_id, p.experience_id
    from exp_packages p
    join exp_editions e
      on e.experience_id = p.experience_id
     and (p.edition_id is null or p.edition_id = e.id)   -- shared packages fan out
   where p.archived_at is null and e.archived_at is null
),
alloc as (
  select package_id, edition_id, count(*)::int as used
    from exp_secured_bookings
   where package_id is not null and edition_id is not null
   group by 1, 2
),
base as (
  select pe.package_id, pe.edition_id, pe.experience_id,
         ep.cap as edition_cap, ep.used as edition_used, ep.free as edition_free,
         ep.over_cap as edition_over,
         p.max_spots as allocation_cap,
         coalesce(a.used, 0) as allocation_used,
         case when p.max_spots is null then null
              else greatest(0, p.max_spots - coalesce(a.used, 0)) end as allocation_free,
         rp.rooms, rp.rooms_ever, rp.beds_total, rp.beds_used, rp.beds_free,
         rp.beds_over, coalesce(rp.beds_unknown, false) as beds_unknown,
         rp.sellable as room_free,
         p.hotel_id, p.room_type, p.beds_per_booking,
         (p.hotel_id is not null and p.room_type is null
          and not exists (select 1 from exp_package_rooms pr where pr.package_id = p.id))
                                                        as pool_undeclared
    from pkg_edition pe
    join exp_packages    p  on p.id = pe.package_id
    join exp_edition_pool ep on ep.edition_id = pe.edition_id
    left join exp_package_room_pool rp
           on rp.package_id = pe.package_id and rp.edition_id = pe.edition_id
    left join alloc a
           on a.package_id = pe.package_id and a.edition_id = pe.edition_id
)
select b.*,
       least(b.edition_free, b.allocation_free, b.room_free) as spots_left,
       -- An ARRAY, not a winner. When the week is over its cap AND the hotel is
       -- full, naming only one of them sends the operator to the wrong lever.
       (select coalesce(array_agg(x.k order by x.k), '{}')
          from (values ('edition', b.edition_free),
                       ('allocation', b.allocation_free),
                       ('rooms', b.room_free)) as x(k, v)
         where x.v is not null
           and x.v = least(b.edition_free, b.allocation_free, b.room_free)) as binding
  from base b;

-- ───────────────────────────────────────────────────────────── access ─────

-- Service-role only: these views read exp_bookings, and the public pages
-- already fetch spot counts through the service-role client.
revoke all on exp_secured_bookings, exp_room_pool_units, exp_package_room_pool,
              exp_edition_pool, exp_package_availability from anon, authenticated;
grant select on exp_secured_bookings, exp_room_pool_units, exp_package_room_pool,
                exp_edition_pool, exp_package_availability to service_role;

-- ─────────────────────────────────────────────────────── the dead one ─────

comment on column exp_editions.spots_taken is
  'DEAD — no writer exists in the application. Values are frozen at the 2026
   Notion import and under-report by up to 13 heads. Read exp_edition_pool
   instead. Kept only because migrations here are additive-only.';
