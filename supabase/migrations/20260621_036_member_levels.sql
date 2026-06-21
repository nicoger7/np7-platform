-- Migration 036: Member level system
-- One overall level per member with provenance (self → coach-suggested → coach-
-- verified), an editable + tiered milestone catalog that derives a suggested
-- level, a standing consent toggle, and an append-only progression history.
-- Additive + idempotent; all app code tolerates this being unapplied.

-- contacts: the member-facing level layer. The existing `level` becomes the
-- coach's value and `level_notes` its rationale; both stay team-owned.
alter table contacts add column if not exists self_level             text;
alter table contacts add column if not exists level_status           text;     -- 'self' | 'suggested' | 'verified'
alter table contacts add column if not exists coach_can_manage_level boolean not null default false;
alter table contacts add column if not exists level_verified_at      timestamptz;

-- milestone catalog (editable; tiers map a completed set → a derived level)
create table if not exists level_milestones (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  label       text not null,
  tier        text not null,                 -- Beginner | Intermediate | Advanced | Pro
  discipline  text,                           -- optional tag (windsurf default); null = all
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- which milestones a member has achieved (coach-ticked)
create table if not exists contact_milestones (
  contact_id   uuid not null references contacts(id) on delete cascade,
  milestone_id uuid not null references level_milestones(id) on delete cascade,
  achieved_at  timestamptz not null default now(),
  set_by       uuid,                           -- team_members.id
  primary key (contact_id, milestone_id)
);
create index if not exists contact_milestones_contact_idx on contact_milestones(contact_id);

-- append-only progression timeline
create table if not exists contact_level_history (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  level       text,
  status      text,                            -- self | suggested | verified
  source      text,                            -- self | coach | milestone
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists contact_level_history_contact_idx on contact_level_history(contact_id, created_at desc);

-- RLS
alter table level_milestones      enable row level security;
alter table contact_milestones    enable row level security;
alter table contact_level_history enable row level security;

drop policy if exists "level_milestones public read" on level_milestones;
create policy "level_milestones public read" on level_milestones for select using (true);
drop policy if exists "level_milestones team write" on level_milestones;
create policy "level_milestones team write" on level_milestones for all using (is_team_member()) with check (is_team_member());

drop policy if exists "contact_milestones own read" on contact_milestones;
create policy "contact_milestones own read" on contact_milestones for select
  using (is_team_member() or contact_id in (select id from contacts where auth_user_id = auth.uid()));
drop policy if exists "contact_milestones team write" on contact_milestones;
create policy "contact_milestones team write" on contact_milestones for all using (is_team_member()) with check (is_team_member());

drop policy if exists "contact_level_history own read" on contact_level_history;
create policy "contact_level_history own read" on contact_level_history for select
  using (is_team_member() or contact_id in (select id from contacts where auth_user_id = auth.uid()));
drop policy if exists "contact_level_history team write" on contact_level_history;
create policy "contact_level_history team write" on contact_level_history for all using (is_team_member()) with check (is_team_member());

-- seed the windsurf ladder (idempotent on key)
insert into level_milestones (key, label, tier, discipline, sort_order) values
  ('uphaul_sail',   'Uphaul & sail',      'Beginner',     'windsurf',  10),
  ('steer_turn',    'Steer & turn',       'Beginner',     'windsurf',  20),
  ('sail_upwind',   'Sail upwind',        'Beginner',     'windsurf',  30),
  ('beach_start',   'Beach start',        'Beginner',     'windsurf',  40),
  ('planing',       'Planing',            'Intermediate', 'windsurf',  50),
  ('footstraps',    'Footstraps',         'Intermediate', 'windsurf',  60),
  ('harness',       'Harness',            'Intermediate', 'windsurf',  70),
  ('jibe_entry',    'Jibe entry',         'Intermediate', 'windsurf',  80),
  ('carve_jibe',    'Carve jibe',         'Advanced',     'windsurf',  90),
  ('water_start',   'Water start',        'Advanced',     'windsurf', 100),
  ('duck_jibe',     'Duck jibe',          'Advanced',     'windsurf', 110),
  ('chop_hop',      'Chop hop',           'Advanced',     'windsurf', 120),
  ('forward_loop',  'Forward loop',       'Pro',          'windsurf', 130),
  ('wave_riding',   'Wave riding',        'Pro',          'windsurf', 140),
  ('adv_freestyle', 'Advanced freestyle', 'Pro',          'windsurf', 150)
on conflict (key) do nothing;
