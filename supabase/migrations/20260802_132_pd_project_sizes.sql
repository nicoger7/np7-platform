-- Migration 132: Product Development — sizes.
--
-- The Cobra drawings proved rake and back end are properties of a SIZE, not of
-- a layup: the 37 NP7 TT BOX (back end 27 mm, drawn 84° = rake 6°) and the
-- 44 NP7 DTT BOX (back end 20 mm, drawn 86° = rake 4°) come off the SAME ply
-- stack. pd_layups.geometry can hold one geometry, so flattening two sizes into
-- it would quietly corrupt the record on the first fin anyone quoted.
--
-- Child rows of the project, like plies are of a layup: no archived_at, they
-- live and die with their program. The drawings state the angle as 90° − rake;
-- we store rake, and the note field keeps whatever the drawing literally said.

create table if not exists pd_project_sizes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references pd_projects(id) on delete cascade,
  label       text not null,                 -- "37 NP7 TT BOX"
  length_cm   numeric,                       -- 37 / 44
  box         text,                          -- 'TT' | 'DTT' | 'powerbox' … free text: box systems multiply
  rake_deg    numeric,                       -- 6 / 4
  back_end_mm numeric,                       -- 27 / 20
  sort_order  int not null default 0,
  notes       text,
  source_id   uuid references pd_sources(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, label)
);
create index if not exists pd_project_sizes_project_idx on pd_project_sizes (project_id, sort_order, length_cm);

comment on column pd_project_sizes.rake_deg is
  'Rake in degrees. Supplier drawings usually state the trailing-edge angle instead (84° = rake 6°); keep the drawn number in notes if it differs.';

-- ── RLS: zero-policy enable (service role only, like 129) ────────────────────
alter table pd_project_sizes enable row level security;
