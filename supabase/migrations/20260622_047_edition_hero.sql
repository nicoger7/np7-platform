-- 047 · Per-edition hero image (override + email opt-in)
--
-- An edition can now carry its OWN hero photo, overriding the experience's shared
-- hero (exp_experiences.hero_image) just for that edition. `hero_in_emails` says
-- whether that edition's emails use this override (else they fall back to the
-- experience hero). Setting a hero "for all editions" writes the experience hero
-- instead (handled in the admin), so this column stays a true per-edition override.
--
-- Additive + re-runnable. Reads/writes are tolerant of these columns being absent
-- until applied (edition just inherits the experience hero; emails unchanged).

alter table exp_editions
  add column if not exists hero_image     text,
  add column if not exists hero_in_emails boolean not null default true;

comment on column exp_editions.hero_image is 'Per-edition hero override; null = inherit the experience hero (exp_experiences.hero_image).';
comment on column exp_editions.hero_in_emails is 'When true, this edition''s emails use its hero override; else they use the experience hero.';
