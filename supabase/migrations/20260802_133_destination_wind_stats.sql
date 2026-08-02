-- 133 · Measured wind climatology on destinations.
--
-- The experience page claimed "85-95% wind probability" from a hand-typed
-- field — a number nobody could source. The spotguide already computes real
-- climatology per spot from Open-Meteo's ERA5 archive; destinations get the
-- same cache so the trip pages can show a small, sourced graph for the months
-- around each edition instead of an invented percentage.
alter table destinations add column if not exists wind_stats jsonb;
alter table destinations add column if not exists wind_stats_at timestamptz;
