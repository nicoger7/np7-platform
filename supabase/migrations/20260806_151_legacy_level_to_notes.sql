-- ============================================================================
-- 151 — "Harness & Footstraps" is a skill, not a level.
--
-- 234 contacts carry a value in contacts.level that the platform does not
-- recognise — Harness & Footstraps (79), Power Jibe (67), Amateur Racer (88).
-- They came in from the old system, and isLevel() rejects all three, so the app
-- has always treated those riders as having NO rank. Meanwhile anyone opening
-- the contact sees "Power Jibe" and assumes a level is set. That gap is how a
-- Bonaire guest looked ranked when nothing about their level was known.
--
-- Nico: these describe SKILLS, not a level. We do not know these riders' rank.
--
-- So the level is cleared — honestly, since the app already ignored it — and the
-- old value is kept verbatim in level_notes, which exists for exactly this and
-- sits beside the level in the admin. Nothing is thrown away; it stops
-- masquerading as a rank.
--
-- Each maps onto a real milestone in the ladder, if these are ever converted to
-- self-logged skills: Harness & Footstraps → harness + footstraps, Power Jibe →
-- pro_powerjibe, Amateur Racer → pro_racingbasics. Not done here — self-logging
-- a skill for 234 people on the strength of an old import is a claim about their
-- riding, and it should be theirs to make.
-- ============================================================================

update contacts
   set level_notes = coalesce(nullif(btrim(level_notes), '') || E'\n', '')
                     || 'From the old system: "' || level || '" — a skill, not a rank. Level unknown; ask or let a coach verify.',
       level = null,
       updated_at = now()
 where level is not null
   and level not in ('Beginner','Intermediate','Advanced','Expert','Semi-Pro','Pro')
   and coalesce(level_notes, '') not like '%From the old system:%';
