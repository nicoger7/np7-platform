-- ============================================================================
-- 188 — Partner API keys with editable scopes.
--
-- Until now every machine-to-machine caller shared ONE env secret. For
-- wind.coach that single value guards three different trust levels at once:
-- writing guide rows (HMAC), setting skill verifications (Bearer), and reading
-- every participant NAME on every trip (Bearer). A leak means all three, and
-- the only remedy is a global rotation that breaks everything simultaneously.
--
-- This table makes access a thing Nico edits in the admin instead of a thing
-- Claude deploys: one key per partner, scopes ticked per resource, revocable
-- individually, with a last-used stamp so a forgotten key is visible.
--
-- The key itself is NEVER stored. We keep a SHA-256 hash plus a short display
-- prefix, so the admin can tell keys apart and still cannot leak one.
-- ============================================================================

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- "wind.coach", "jibe box", …
  key_prefix text not null,                 -- first 8 chars, for display only
  key_hash text not null unique,            -- sha256(full key), the real check
  scopes text[] not null default '{}',      -- 'trips:read', 'guides:write', …
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references team_members(id) on delete set null,
  last_used_at timestamptz,
  last_used_scope text,
  use_count bigint not null default 0,
  revoked_at timestamptz
);

create index if not exists idx_api_keys_hash on api_keys(key_hash) where revoked_at is null;

-- Service-role only: this table is the front door's lock, never client-readable.
alter table api_keys enable row level security;

comment on table api_keys is
  'Partner API keys with editable scopes. The key is never stored — only sha256(key). Scopes name RESOURCES (trips:read, riders:read, guides:write, skills:write), not tables, so a partner cannot be coupled to our column names.';
