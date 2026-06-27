-- ============================================================
-- 20260621_042_team_members_role_freetext.sql
--   team_members.role has a CHECK constraint from migration 007 that limits
--   values to ('admin', 'editor', 'coach', 'operations'). New role values added
--   later (via the team_roles/role_ids system from 045+) shouldn't be blocked
--   by an old enum-style constraint. Role values are controlled by the app, not
--   the DB.
-- ============================================================

alter table team_members drop constraint if exists team_members_role_check;
