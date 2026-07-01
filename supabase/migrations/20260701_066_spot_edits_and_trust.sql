-- ─────────────────────────────────────────────────────────────────────────
-- 066 · Spotguide: member-suggested edits + contributor trust tiers
-- ─────────────────────────────────────────────────────────────────────────
-- Until now members could ADD a spot (verified by 3 confirms) but never
-- CORRECT an existing one. This adds a per-field "suggest an edit" flow and a
-- trust ladder that lets people who clearly know a place fast-track changes:
--
--   • spot_edits          — a proposed change to ONE editorial field of a spot
--                           (name | summary | description | pin | level |
--                           conditions). Resolves per the author's standing.
--   • spot_edit_confirms  — cross-member confirm/reject on a proposed edit
--                           (mirrors spot_verifications).
--   • spotguide_trust     — explicit NP7 grants. Two roles:
--                             - moderator  (global; NP7-appointed)
--                             - specialist (per destination; NP7-appointed;
--                               ALSO earned automatically in code from activity)
--
-- Base rule stays "3 member confirms". A local specialist's edit needs only 1;
-- a moderator's applies immediately. A confirm FROM a specialist/moderator is
-- enough on its own. Facts (ratings, level/condition tallies, wind window) and
-- wind statistics are NOT part of this — they aggregate / compute as before.
-- Additive-only (Notion sync safe).
-- ─────────────────────────────────────────────────────────────────────────

-- 1 · Proposed edits ──────────────────────────────────────────────────────
create table if not exists spot_edits (
  id            uuid primary key default gen_random_uuid(),
  spot_id       uuid not null references spots(id) on delete cascade,
  contact_id    uuid not null references contacts(id) on delete cascade,  -- proposer
  field         text not null,                     -- name|summary|description|pin|level|conditions
  old_value     jsonb,                             -- snapshot at proposal time (audit/display)
  new_value     jsonb not null,                    -- proposed value
  note          text,                              -- optional "why"
  status        text not null default 'pending',   -- pending|applied|rejected|superseded
  applied_at    timestamptz,
  applied_by    uuid references contacts(id) on delete set null,  -- who tipped it (null = auto by standing)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists spot_edits_spot_idx   on spot_edits (spot_id, status);
create index if not exists spot_edits_status_idx on spot_edits (status);

-- 2 · Confirmations on a proposed edit ────────────────────────────────────
create table if not exists spot_edit_confirms (
  id          uuid primary key default gen_random_uuid(),
  edit_id     uuid not null references spot_edits(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  kind        text not null default 'confirm',     -- confirm|reject
  created_at  timestamptz not null default now(),
  unique (edit_id, contact_id)
);
create index if not exists spot_edit_confirms_edit_idx on spot_edit_confirms (edit_id);

-- 3 · Explicit trust grants (earned specialist standing is layered on in code) ─
create table if not exists spotguide_trust (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references contacts(id) on delete cascade,
  role           text not null,                    -- moderator|specialist
  destination_id uuid references destinations(id) on delete cascade,  -- null for moderator
  granted_by     uuid references contacts(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists spotguide_trust_contact_idx on spotguide_trust (contact_id);
create index if not exists spotguide_trust_dest_idx    on spotguide_trust (destination_id);
-- one moderator row per contact; one specialist row per (contact, destination)
create unique index if not exists spotguide_trust_mod_uq  on spotguide_trust (contact_id) where role = 'moderator';
create unique index if not exists spotguide_trust_spec_uq on spotguide_trust (contact_id, destination_id) where role = 'specialist';
