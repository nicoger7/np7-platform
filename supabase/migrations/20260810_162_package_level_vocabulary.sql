-- ============================================================================
-- 162 — One word for one coaching level.
--
-- exp_packages.category had two vocabularies, decided by which screen you were
-- on: the standalone Packages page offered "advanced", the edition's Packages
-- tab offered "pro". Same column, same meaning, different word.
--
-- The word is load-bearing. exp_edition_level_caps.level joins on it to cap
-- each coaching group, and the public picker splits packages by it. A package
-- saved as "pro" matches no cap — so it sells straight past the level's limit —
-- and appears as its own tab on the website beside Advanced and Beginner.
-- Exactly one package was already in that state: the Alaçatı race-clinic
-- ticket, which is why it never counted against a level.
--
-- The database is the only place that can end this. The UI now imports one
-- list (src/lib/package-levels.ts); the constraint makes a third copy fail
-- loudly instead of quietly creating a fourth level.
-- ============================================================================

-- 'pro' → 'advanced'. The level caps for every edition are written in
-- advanced/beginner, and 42 packages already use it against this one.
update exp_packages set category = 'advanced', updated_at = now()
 where category = 'pro';

-- Any other stray casing/whitespace, before the constraint refuses it.
update exp_packages set category = lower(btrim(category)), updated_at = now()
 where category is not null and category <> lower(btrim(category));

alter table exp_packages drop constraint if exists exp_packages_category_vocabulary;
alter table exp_packages add constraint exp_packages_category_vocabulary
  check (category is null or category in ('advanced', 'beginner', 'mixed'));

comment on column exp_packages.category is
  'Which coaching group this package buys: advanced | beginner | mixed (null = none). Joined by exp_edition_level_caps.level and used by the public picker to split packages — NOT a rider''s ability level (that is the member LEVELS taxonomy: Beginner…Pro).';
