-- Per-WEEK day-by-day program (optional override).
--
-- The day-by-day lives on exp_content.daily_program = one program for the whole
-- experience. Most weeks run the same shape, but a single week can differ (a
-- different activity day, a shifted rest day). NULL = inherit the experience's
-- program, so nothing changes until a week is deliberately customised.
alter table exp_editions add column if not exists daily_program jsonb;
