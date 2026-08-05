-- ============================================================================
-- 150 — The fourth rank is "Expert", not "Amateur".
--
-- Beginner · Intermediate · Advanced · Expert · Semi-Pro · Pro.
--
-- "Amateur" read as a step DOWN from Advanced to anyone scanning the ladder,
-- which is the opposite of what it means here — it is the rank above Advanced,
-- where every core skill is solid. "Expert" says that without a footnote.
--
-- A label change, not a semantic one: the same rank, the same milestones, the
-- same position. So the history is renamed too — leaving it as "Amateur" would
-- make a member's own timeline show a rank the ladder no longer has.
--
-- NOT touched: contacts.level = 'Amateur Racer' (88 rows). That column carries a
-- second vocabulary — Harness & Footstraps, Power Jibe, Amateur Racer, Expert —
-- which is the rider's self-described ability, not this ladder. Renaming it here
-- would merge two different scales that happen to share a column.
-- ============================================================================

-- Drop first, rename, then re-add. Adding the new CHECK up front fails: it is
-- validated against the existing rows, which still say 'Amateur'.
alter table level_milestones drop constraint if exists level_milestones_rank_chk;

update level_milestones        set rank  = 'Expert' where rank  = 'Amateur';

alter table level_milestones add constraint level_milestones_rank_chk
  check (rank is null or rank = any (array['Beginner','Intermediate','Advanced','Expert','Semi-Pro','Pro']));
update contact_level_history   set level = 'Expert' where level = 'Amateur';

-- Array columns: swap the element, leave every other level in place.
update destinations set levels = array_replace(levels, 'Amateur', 'Expert')
 where 'Amateur' = any (levels);
update spots        set levels = array_replace(levels, 'Amateur', 'Expert')
 where 'Amateur' = any (levels);

-- spot_ratings carries the same vocabulary in a scalar column.
update spot_ratings set level = 'Expert' where level = 'Amateur';
