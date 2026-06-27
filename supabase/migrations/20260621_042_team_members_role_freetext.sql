-- 042 · team_members.role is a free-text JOB TITLE, not an access role.
--
-- Access is governed by access_level (owner / manager, migration 028) + role_ids
-- (granular roles, migration 045). The `role` column was repurposed as a plain
-- job-title label ("Role (job title)" in the UI), but the legacy
-- team_members_role_check constraint still pinned it to the old access-role enum.
-- So saving a job title like "NP7 Media Master" failed with a 23514 check
-- violation, and the New Member "Create" button silently did nothing.
--
-- Drop the constraint so `role` accepts any label. Relaxing a CHECK is additive
-- (it only widens what's allowed) and touches no data.

alter table team_members drop constraint if exists team_members_role_check;
