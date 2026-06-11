-- Migration 014: Experience website content — certainty fields
-- Per-experience "this will happen" content for the event page:
--   wind_probability — e.g. "85–95%" (wind probability in season)
--   wind_range       — e.g. "12–25 knots"
--   no_wind_program  — the plan-B program for rare light-wind days (varies per experience)
-- (Applied via Management API on 2026-06-11; kept here for the record.)

alter table exp_content
  add column if not exists no_wind_program  text,
  add column if not exists wind_probability text,
  add column if not exists wind_range       text;
