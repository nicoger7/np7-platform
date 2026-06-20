-- Owner-managed admin access tiers.
-- NULL is treated as 'owner' in application code, so existing team members keep
-- full access (no lockout). New members get a tier from the Team editor.
alter table team_members add column if not exists access_level text;
