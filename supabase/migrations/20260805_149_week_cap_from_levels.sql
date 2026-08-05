-- ============================================================================
-- 149 — The level caps ARE the week cap.
--
-- Nico: "The advanced vs beginner cap is the more important one. It defines what
-- is total week cap."
--
-- He's right, and 148 left the two fighting. Bonaire Week II now says advanced
-- 16/16 and beginner 4/6 — two places genuinely free — while exp_editions.
-- max_spots still held a stale 8, which won the LEAST() and kept the week
-- reading "fully booked". Same on Weeks I and III: the levels allowed 15 and 18,
-- the typed week caps allowed 5 and 2.
--
-- So max_spots stops being a number anyone maintains alongside the levels. Where
-- level caps exist, the week cap is their sum. Where they don't, the typed
-- max_spots still applies — a trip with no level split needs some ceiling, and
-- events and one-level weeks have no categories to add up.
--
-- This is the same rule we have applied all session: two places holding one
-- number is how spots_taken came to read 3 on a week with twenty-one people.
-- ============================================================================

create or replace view exp_edition_pool with (security_invoker = on) as
select e.id as edition_id,
       e.experience_id,
       -- The levels win when they exist. coalesce, not greatest: a level split
       -- is a deliberate statement about how the week is sold, and a leftover
       -- max_spots from an earlier season should not override it.
       coalesce(lc.total, e.max_spots)                as cap,
       coalesce(s.used, 0)::int                       as used,
       case when coalesce(lc.total, e.max_spots) is null then null
            else greatest(0, coalesce(lc.total, e.max_spots) - coalesce(s.used, 0)) end as free,
       greatest(0, coalesce(s.used, 0)
                   - coalesce(coalesce(lc.total, e.max_spots), coalesce(s.used, 0)))::int as over_cap,
       -- So the admin can say WHERE the ceiling came from, rather than showing a
       -- number in a box nobody may edit and not explaining why.
       (lc.total is not null)                         as cap_from_levels,
       e.max_spots                                    as cap_typed
  from exp_editions e
  left join (select edition_id, sum(max_spots)::int as total
               from exp_edition_level_caps group by edition_id) lc on lc.edition_id = e.id
  left join (select edition_id, count(*) as used
               from exp_secured_bookings
              where edition_id is not null
              group by edition_id) s on s.edition_id = e.id
 where e.archived_at is null;

revoke all on exp_edition_pool from anon, authenticated;
grant select on exp_edition_pool to service_role;
