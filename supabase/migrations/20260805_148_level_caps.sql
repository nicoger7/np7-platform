-- ============================================================================
-- 148 — A cap per level, because that is how the trips are actually sold.
--
-- Nico: "Advanced 16, limited by rooms. Beginner about 6. So 22 in theory, but
-- never more than 16 advanced." Neither existing limit expresses that. The week
-- cap is one number for everyone, and a package cap is per package — but a level
-- is SEVERAL packages (one per room type), so capping each at 16 would hand each
-- of them 16 of their own.
--
-- The level already exists on exp_packages.category ('advanced' / 'beginner'),
-- and it is well filled in: 38 advanced, 29 beginner, 7 untagged, and Bonaire is
-- complete for every week. So this is a cap to store, not a taxonomy to build.
--
-- It becomes the fourth limit in the same LEAST(), and it is optional: a level
-- with no row is uncapped, exactly like a week with no max_spots.
-- ============================================================================

create table if not exists exp_edition_level_caps (
  edition_id uuid not null references exp_editions(id) on delete cascade,
  level      text not null,
  max_spots  int  not null check (max_spots >= 0),
  updated_at timestamptz not null default now(),
  primary key (edition_id, level)
);

comment on table exp_edition_level_caps is
  'How many of a week may be sold at a given coaching level (exp_packages.category).
   Use it for limits that are NOT about beds — a coach ratio, a group mix. Bed
   limits are derived from the rooms and must never be typed here, or the same
   number ends up in two places and they drift.';

alter table exp_edition_level_caps enable row level security;
revoke all on exp_edition_level_caps from anon, authenticated;
grant select, insert, update, delete on exp_edition_level_caps to service_role;

create index if not exists idx_level_caps_edition on exp_edition_level_caps (edition_id);

-- ── The answer, now with the level in it ────────────────────────────────────
-- Dropped rather than replaced: the new level columns sit before spots_left, and
-- CREATE OR REPLACE cannot reorder a view's columns. Nothing else reads it — the
-- app queries it directly and no other view or function depends on it.
drop view if exists exp_package_availability;
create view exp_package_availability with (security_invoker = on) as
with pkg_edition as (
  select p.id as package_id, e.id as edition_id, p.experience_id
    from exp_packages p
    join exp_editions e
      on e.experience_id = p.experience_id
     and (p.edition_id is null or p.edition_id = e.id)
   where p.archived_at is null and e.archived_at is null
),
alloc as (
  select package_id, edition_id, count(*)::int as used
    from exp_secured_bookings
   where package_id is not null and edition_id is not null
   group by 1, 2
),
-- Secured guests per (week, level). A booking with no package counts against
-- the week only — admin-created bookings often carry none, and guessing a level
-- for them would quietly eat someone else's place.
level_used as (
  select b.edition_id, p.category as level, count(*)::int as used
    from exp_secured_bookings b
    join exp_packages p on p.id = b.package_id
   where b.edition_id is not null and p.category is not null
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
                                                        as pool_undeclared,
         p.category                                     as level,
         lc.max_spots                                   as level_cap,
         coalesce(lu.used, 0)                           as level_used,
         case when lc.max_spots is null then null
              else greatest(0, lc.max_spots - coalesce(lu.used, 0)) end as level_free
    from pkg_edition pe
    join exp_packages    p  on p.id = pe.package_id
    join exp_edition_pool ep on ep.edition_id = pe.edition_id
    left join exp_package_room_pool rp
           on rp.package_id = pe.package_id and rp.edition_id = pe.edition_id
    left join alloc a
           on a.package_id = pe.package_id and a.edition_id = pe.edition_id
    left join exp_edition_level_caps lc
           on lc.edition_id = pe.edition_id and lc.level = p.category
    left join level_used lu
           on lu.edition_id = pe.edition_id and lu.level = p.category
)
select b.*,
       least(b.edition_free, b.allocation_free, b.room_free, b.level_free) as spots_left,
       (select coalesce(array_agg(x.k order by x.k), '{}')
          from (values ('edition', b.edition_free),
                       ('allocation', b.allocation_free),
                       ('rooms', b.room_free),
                       ('level', b.level_free)) as x(k, v)
         where x.v is not null
           and x.v = least(b.edition_free, b.allocation_free, b.room_free, b.level_free)) as binding
  from base b;

-- ── Per (week, level), for the admin panel ──────────────────────────────────
create or replace view exp_edition_level_pool with (security_invoker = on) as
select e.id as edition_id,
       lv.level,
       lc.max_spots                                   as cap,
       coalesce(u.used, 0)::int                       as used,
       case when lc.max_spots is null then null
            else greatest(0, lc.max_spots - coalesce(u.used, 0)) end as free,
       greatest(0, coalesce(u.used, 0) - coalesce(lc.max_spots, coalesce(u.used, 0)))::int as over_cap,
       -- Packages on this week that carry no level at all: they escape every
       -- level cap, so they are worth naming rather than silently excluding.
       (select count(*) from exp_packages p
         where p.edition_id = e.id and p.archived_at is null and p.category is null)::int as untagged_packages
  from exp_editions e
  cross join lateral (
    select distinct category as level from exp_packages
     where edition_id = e.id and archived_at is null and category is not null
    union
    select level from exp_edition_level_caps where edition_id = e.id
  ) lv
  left join exp_edition_level_caps lc on lc.edition_id = e.id and lc.level = lv.level
  left join (
    select b.edition_id, p.category as level, count(*) as used
      from exp_secured_bookings b join exp_packages p on p.id = b.package_id
     where b.edition_id is not null and p.category is not null
     group by 1, 2
  ) u on u.edition_id = e.id and u.level = lv.level
 where e.archived_at is null;

revoke all on exp_edition_level_pool from anon, authenticated;
grant select on exp_edition_level_pool to service_role;
