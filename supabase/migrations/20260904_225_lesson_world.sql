-- 225 · A lesson belongs to a world, or to none
--
-- The sidebar offers "How this page works" by matching the current path against
-- each lesson's route_hint, longest prefix first. One lesson is hinted at plain
-- /admin, so it matched every page in the admin including all of NP7
-- Performance, and offered a lesson about bookings and editions to somebody
-- looking at the hardware budget.
--
-- Null means the lesson applies anywhere. Every lesson written so far is about
-- running trips, so they are all Experience.
alter table tr_lessons add column if not exists world text;
comment on column tr_lessons.world is
  'experience | hardware | null. Null applies anywhere. Keeps a trip-running lesson off a Performance page.';
update tr_lessons set world = 'experience'
 where world is null and route_hint is not null;
