-- Migration 218: a revenue kind, and two seeds that landed in the wrong lane.
--
-- Money arriving is a roadmap event in its own right: pre-orders opening and
-- balances falling due are dates the company plans around. They were seeded as
-- 'production' because the seed had nowhere better to put them.
--
-- The air-freight line matched the tooling test ("...board samples...") before
-- the shipping one, because a CASE stops at its first true branch. Reclassified
-- rather than re-ordered, since 217 has already run.

alter table roadmap_items drop constraint if exists roadmap_items_kind_check;
alter table roadmap_items add constraint roadmap_items_kind_check
  check (kind in ('tooling','production','shipping','funding','revenue','legal','launch','trip','hiring','other'));

update roadmap_items set kind = 'shipping'
 where kind = 'tooling' and (title ilike '%freight%' or title ilike '%customs%');

update roadmap_items set kind = 'revenue'
 where kind = 'production'
   and (title ilike '%pre-order deposit%' or title ilike '%balances on delivery%'
        or title ilike '%performance fins%');
