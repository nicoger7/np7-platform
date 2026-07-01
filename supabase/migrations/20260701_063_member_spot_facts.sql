-- Migration 063: member-contributed spot facts (crowd-aggregated)
-- ─────────────────────────────────────────────────────────────────────────
-- Members don't rate "wind" (the Open-Meteo climatology chart is the objective
-- wind signal). Instead each member contributes the facts they actually know,
-- which we average across everyone next to NP7's:
--   • level     — which level the spot suits (LEVELS)
--   • conditions — the water state they saw (flat/chop/waves/mixed)
--   • wind_window — the directions that worked for them → a crowd windrose
-- The remaining `ratings` jsonb now only holds season-independent star criteria
-- (safety/beauty/infrastructure/family for spots).
-- Additive + idempotent.

alter table spot_ratings
  add column if not exists level       text,
  add column if not exists conditions  text[] not null default '{}',
  add column if not exists wind_window jsonb  not null default '{}'::jsonb;
