-- 049 · Unify access into roles: Owner + Manager become built-in roles
--
-- Replaces the separate owner/manager access_level tier with two BUILT-IN roles
-- in team_roles (system_key = 'owner' | 'manager'). Their access is computed in
-- code (src/lib/access.ts builtinAccess) from the live section catalog — the
-- stored `access` jsonb is ignored — so Owner always means "everything" even as
-- new sections are added. Existing members are migrated from access_level into
-- the matching built-in role. access_level is kept (unused) as a safety fallback.
--
-- Additive + idempotent. Needs migration 045 (team_roles + role_ids).

alter table team_roles add column if not exists system_key text unique;

insert into team_roles (name, description, access, is_system, system_key) values
  ('Owner',   'Full access to everything.',                                  '{}'::jsonb, true, 'owner'),
  ('Manager', 'Everything except Finance, Company Settings and Team admin.', '{}'::jsonb, true, 'manager')
on conflict (system_key) do update set name = excluded.name, description = excluded.description, is_system = true;

-- Migrate members that have no custom roles yet from their tier → the built-in role.
update team_members tm
  set role_ids = array[(select id from team_roles where system_key = 'manager')]
  where (tm.role_ids is null or tm.role_ids = '{}') and tm.access_level = 'manager';

update team_members tm
  set role_ids = array[(select id from team_roles where system_key = 'owner')]
  where (tm.role_ids is null or tm.role_ids = '{}')
    and (tm.access_level is null or tm.access_level <> 'manager');
