-- Per-coaching-level copy for the "your epic week" section.
--
-- One shared list had to promise the same week to a first-timer and to someone
-- chasing their first planing jibe, so it promised neither of them anything
-- specific. Each level can now carry its own headline and cards.
--
-- Deliberately additive: a level with no entry falls back to week_title /
-- week_outcomes, and the website only shows the switcher on experiences that
-- actually sell more than one level. Existing pages render unchanged.
--
-- Shape: {"beginner": {"title": "...", "cards": [{"icon": "", "t": "", "d": ""}]}, ...}
alter table exp_content add column if not exists week_outcomes_by_level jsonb;

comment on column exp_content.week_outcomes_by_level is
  'Per-coaching-level override for the epic-week section. Level key = exp_packages.category. Missing level falls back to week_title/week_outcomes.';
