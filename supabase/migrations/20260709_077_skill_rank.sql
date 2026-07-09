-- 077: Progress skills store their RANK directly (Beginner…Pro), replacing the
-- derived `difficulty` number. Backfills `rank` LOSSLESSLY from the current
-- difficulty bands (BAND_MAX = 14/28/46/62/85/∞) — i.e. exactly what
-- rankForDifficulty() computes today — so the existing division is preserved and
-- nothing has to be re-entered. The engine + admin editor now read `rank`;
-- `difficulty` is kept (default 10, harmless) for back-compat and can be dropped
-- later. See [[project-progression-system]].

alter table level_milestones
  add column if not exists rank text;

do $$ begin
  alter table level_milestones add constraint level_milestones_rank_chk
    check (rank is null or rank in ('Beginner','Intermediate','Advanced','Amateur','Semi-Pro','Pro'));
exception when duplicate_object then null; end $$;

-- Backfill from the current difficulty bands (only rows not already set).
update level_milestones set rank = case
  when difficulty <= 14 then 'Beginner'
  when difficulty <= 28 then 'Intermediate'
  when difficulty <= 46 then 'Advanced'
  when difficulty <= 62 then 'Amateur'
  when difficulty <= 85 then 'Semi-Pro'
  else 'Pro'
end
where rank is null;

-- Keep the legacy `tier` column consistent with the new rank (deriveSuggestedLevel
-- still reads tier for the separate member-level suggestion).
update level_milestones set tier = rank where tier is distinct from rank;

-- Optional cleanup once verified in production (the code no longer needs it):
--   alter table level_milestones drop column difficulty;
