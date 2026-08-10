-- ============================================================================
-- 161 — A booking takes a ROOM, not a bed.
--
-- Nico, describing how NP7 actually sells:
--
--   "People book rooms by themselves. Sometimes they bring a wife or partner
--    that doesn't take part. Sometimes they just stay in it alone. Sometimes
--    they bring someone that also takes part. We barely sell single rooms —
--    it's almost always double rooms with single or double use."
--
-- Every one of those is ONE ROOM. Whether the second pillow is used, and by
-- whom, changes nothing about what we can sell: five double rooms take five
-- bookings.
--
-- The pool was counting BEDS — five doubles read as ten sellable — so it needed
-- a `sleeps` number on every room before it could limit anything, and needed
-- the team to declare per package how many beds a booking consumes. Both were
-- answers to a question the business never asks. Neither was ever filled in,
-- which is why nothing has been limiting anything.
--
-- Counting rooms needs no `sleeps` at all. A room is free until a booking is in
-- it. When two participants share, they are two bookings in one room — that
-- HANDS a room back, so the count can only ever be conservative, never oversold.
--
-- beds / sleeps / beds_per_booking are all kept and still reported: they are how
-- you know whether two people physically fit, which is a rooming question, not
-- a selling one.
-- ============================================================================

create or replace view exp_room_pool_units as
with live as (
  select r.id, r.edition_id, r.hotel_id, r.room_type, r.name, r.room_id,
         coalesce(r.room_id, r.id) as unit_id,
         r.released_at, r.booking_id, r.extra_booking_ids, r.partner_tag_along
    from exp_hotel_rooms r
   where r.archived_at is null and r.edition_id is not null
), occupants as (
  select distinct l_1.edition_id, l_1.unit_id, b.id as booking_id,
         coalesce(p.beds_per_booking, 1) as beds
    from live l_1
    join exp_bookings b
      on b.id = l_1.booking_id or (b.id = any (coalesce(l_1.extra_booking_ids, '{}'::uuid[])))
    left join exp_packages p on p.id = b.package_id
   where b.status is distinct from 'lost'
), used as (
  select occupants.edition_id, occupants.unit_id, sum(occupants.beds)::integer as beds,
         count(*)::integer as bookings
    from occupants
   group by occupants.edition_id, occupants.unit_id
), tagalongs as (
  select live.edition_id, live.unit_id,
         count(distinct btrim(live.partner_tag_along))::integer as n
    from live
   where nullif(btrim(coalesce(live.partner_tag_along, '')), '') is not null
   group by live.edition_id, live.unit_id
)
select l.edition_id,
       l.unit_id,
       (array_agg(l.hotel_id) filter (where l.hotel_id is not null))[1] as hotel_id,
       (array_agg(l.room_type) filter (where l.room_type is not null))[1] as room_type,
       (array_agg(l.name))[1] as name,
       count(*)::integer as rows_merged,
       bool_and(l.released_at is not null) as released,
       max(rm.sleeps) as beds,
       max(rm.sleeps) is null as beds_unknown,
       coalesce(u.beds, 0) + coalesce(t.n, 0) as beds_used,
       case when max(rm.sleeps) is null then null::integer
            else greatest(0, max(rm.sleeps) - (coalesce(u.beds, 0) + coalesce(t.n, 0)))
       end as beds_free,
       case when max(rm.sleeps) is null then 0
            else greatest(0, (coalesce(u.beds, 0) + coalesce(t.n, 0)) - max(rm.sleeps))
       end as beds_over,
       -- The fact that actually limits a sale: is anybody in this room?
       coalesce(u.bookings, 0) > 0 as occupied
  from live l
  left join exp_rooms rm on rm.id = l.room_id
  left join used u on u.edition_id = l.edition_id and u.unit_id = l.unit_id
  left join tagalongs t on t.edition_id = l.edition_id and t.unit_id = l.unit_id
 group by l.edition_id, l.unit_id, u.beds, u.bookings, t.n;

create or replace view exp_package_room_pool as
with pkg as (
  select p.id, p.hotel_id, p.room_type, p.beds_per_booking,
         (exists (select 1 from exp_package_rooms pr where pr.package_id = p.id)) as has_links
    from exp_packages p
   where p.archived_at is null
), matched as (
  select pk.id as package_id, pk.beds_per_booking,
         u.edition_id, u.unit_id, u.hotel_id, u.room_type, u.name, u.rows_merged,
         u.released, u.beds, u.beds_unknown, u.beds_used, u.beds_free, u.beds_over, u.occupied
    from pkg pk
    join exp_room_pool_units u
      on (pk.has_links and (u.unit_id in (select pr.room_id from exp_package_rooms pr
                                           where pr.package_id = pk.id and pr.room_id is not null)))
      or (not pk.has_links and pk.hotel_id is not null and pk.room_type is not null
          and u.hotel_id = pk.hotel_id and u.room_type = pk.room_type)
)
select package_id,
       edition_id,
       count(*) filter (where not released)::integer as rooms,
       count(*)::integer as rooms_ever,
       sum(beds) filter (where not released)::integer as beds_total,
       sum(beds_used) filter (where not released)::integer as beds_used,
       sum(beds_free) filter (where not released)::integer as beds_free,
       sum(beds_over) filter (where not released)::integer as beds_over,
       coalesce(bool_or(beds_unknown) filter (where not released), false) as beds_unknown,
       -- Rooms still empty. No `sleeps` needed: an unfilled bed count can no
       -- longer make the whole pool unknown and stop it limiting anything.
       -- `sellable` keeps its position — CREATE OR REPLACE cannot reorder or
       -- rename a view's columns, only add to the end.
       -- DELIBERATELY NULL: the room pool informs, it does not block.
       --
       -- Alaçatı 2026 has 11 rooms and all 11 are assigned, while the level
       -- caps still say four spots are open. Blocking on rooms would put
       -- "fully booked" on a page that can still take four bookings — and the
       -- fix for a full hotel is a phone call, not a lost sale. Nico adds
       -- rooms; the software must not decide he can't.
       --
       -- LEAST() ignores NULLs, so this simply drops out of the availability
       -- calculation and the real limits (week capacity, level caps, package
       -- allocation) do the work.
       null::integer as sellable,
       count(*) filter (where not released and not occupied)::integer as rooms_free
  from matched
 group by package_id, edition_id;

comment on view exp_package_room_pool is
  'Accommodation availability in ROOMS. A booking takes a room whether it sleeps one or two — five doubles take five bookings. Two participants sharing are two bookings in one room, which hands a room back, so this can only run conservative. beds/sleeps are still reported for rooming decisions.';
