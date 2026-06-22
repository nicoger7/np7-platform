-- 045 · Custom team roles (granular RBAC)
--
-- Extends the simple owner/manager access_level (migration 028) with named,
-- reusable roles that grant: which WORLDS a member may enter (experience,
-- hardware, product-dev, analytics, + any future ones), which SECTIONS they see
-- within those worlds (none / view / edit), and which sensitive FIELD GROUPS are
-- visible (prices & payments, internal costs & margins, contact PII).
--
-- The `access` jsonb shape (resolved by src/lib/access.ts):
--   {
--     "worlds":   ["experience","analytics"],
--     "sections": { "participants":"edit", "payments":"none", ... },   -- key → none|view|edit
--     "fields":   { "money": false, "costs": false, "contact_pii": true }  -- group → can-see
--   }
--
-- Backward compatible: members WITHOUT a role_id keep behaving exactly as today
-- (owner = full, manager = all-but-owner-only). A member only switches to the
-- granular model once a role is assigned. Owner access_level always stays full.
--
-- Additive + re-runnable.

create table if not exists team_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  access      jsonb not null default '{}'::jsonb,
  is_system   boolean not null default false,   -- reserved presets; not deletable in UI
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table team_roles is
  'Named, reusable admin access roles: worlds + per-section level + field-group visibility (see src/lib/access.ts).';

-- Assign one OR MORE roles to a team member (empty → falls back to access_level
-- tiers). Multiple roles let someone hold a different role per world — e.g. an
-- "Experience Photographer" role plus a "Hardware Viewer" role; their effective
-- access is the union (see mergeAccess() in src/lib/access.ts).
alter table team_members
  add column if not exists role_ids uuid[] not null default '{}';

-- team_roles is team-only data; the admin reads/writes it via the service-role
-- client (which bypasses RLS), same as the rest of the admin tables. Enable RLS
-- with no public policy so it is never readable through the anon/public key.
alter table team_roles enable row level security;
