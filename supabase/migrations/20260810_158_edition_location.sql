-- ============================================================================
-- 158 — A race clinic can happen anywhere.
--
-- Location lives on the experience, which is right for a trip: "NP7 Experience
-- Bonaire" is Bonaire, every year, and putting the place on each edition would
-- be thirteen chances to type it differently.
--
-- It is wrong for a format. "NP7 Race Clinic" is a THING WE DO, not a place —
-- Alaçatı in August, somewhere else in October. Pinning it to the experience
-- forces one experience row per venue, which is the row explosion migration 157
-- just removed.
--
-- So the edition may carry its own location, and null means "inherit". Every
-- existing edition is null, so no trip changes by a single character; only an
-- edition that fills it in overrides its experience.
-- ============================================================================

alter table exp_editions add column if not exists location text;

comment on column exp_editions.location is
  'Where THIS edition happens. Null = inherit exp_experiences.location, which is what every trip does. Set it on event editions, where the format travels and the venue changes per date.';
