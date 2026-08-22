-- Knowledge base (Phase 1): coaching knowledge per SKILL (keyed to the stable
-- level_milestones.key, so ordering/level come from the existing catalog and
-- wind.coach stays compatible) and per EQUIPMENT entry. Sections carry the
-- content; each section knows which of its required questions are still open.
create table if not exists kb_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('skill','equipment')),
  ref_key text,                 -- skill: level_milestones.key · equipment: slug
  title text not null,
  summary text,
  status text not null default 'draft' check (status in ('draft','complete')),
  website_visible boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists kb_entries_kind_ref on kb_entries (kind, ref_key) where ref_key is not null;

create table if not exists kb_sections (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references kb_entries(id) on delete cascade,
  section_key text not null,
  content text not null default '',
  status text not null default 'missing' check (status in ('missing','draft','complete')),
  open_questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (entry_id, section_key)
);

alter table kb_entries enable row level security;
alter table kb_sections enable row level security;
-- Team writes via service role; Phase 2 adds member-read policies for
-- website_visible entries. No anon access today.
