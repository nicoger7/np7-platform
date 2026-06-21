-- Migration 040: coach-managed level ON by default
-- In a coaching context the coach's verified assessment is the source of truth,
-- so standing consent defaults ON — a member can still opt out in their profile.
-- Backfills existing rows (the feature is days old, no real opt-outs yet).

alter table contacts alter column coach_can_manage_level set default true;
update contacts set coach_can_manage_level = true where coach_can_manage_level is not true;
