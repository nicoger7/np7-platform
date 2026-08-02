-- Migration 129: Product Development — the R&D build sheet.
--
-- Everything NP7 knows about how its own gear is made currently lives in a
-- supplier's inbox and a JPEG of a layup diagram. This turns that into rows:
--   project → construction → (mold + layup) → plies,  process → steps,
-- with a shared material catalog and every parameter citing the email it came
-- from. Without it, the crown-jewel manufacturing IP has exactly one copy and
-- it is somebody else's mailbox.
--
-- Shape notes worth knowing before you edit anything here:
--   * The mold↔construction matrix IS the set of pd_layups rows and the gaps
--     between them. Four rows exist for the Rockstar fin — (carbon, 8.3),
--     (carbon, 8.6), (glass, 9.1), (hybrid, 9.1) — and the five combinations
--     that do NOT exist are the statement "carbon uses the thinner molds".
--   * pd_layup_plies is a child table, not jsonb, because the ply list gets
--     diffed row-by-row between molds and joined to the material catalog.
--   * pd_sources is created SECOND: every other table carries source_id, and
--     this file runs top-down in one transaction.
--
-- Generalises to boards with no schema change: pd_projects.kind drives the
-- geometry field catalog in src/lib/product-dev.ts, and the material catalog is
-- global (200 g biax carbon is the same roll in a fin blade and a board deck).
--
-- Additive-only; RLS zero-policy (service role only — same pattern as 087/116).

-- ── The R&D program ──────────────────────────────────────────────────────────

create table if not exists pd_projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                    -- "NP7 Rockstar Fin"
  slug          text not null unique,
  kind          text not null default 'fin'
                check (kind in ('fin','board','foil','accessory')),
  status        text not null default 'concept'
                check (status in ('concept','in_development','tooling','pilot','production','shelved')),
  -- Nullable and NON-OWNING on purpose: hw_products carries a
  -- `using (true)` public-read policy (migration 020), so trade-secret R&D must
  -- never hang off it. A program also exists — and gets shelved — without ever
  -- becoming a SKU.
  hw_product_id uuid references hw_products(id) on delete set null,
  summary       text,                             -- HTML from rich-text-editor
  photos        jsonb not null default '[]',      -- [{key,caption,w,h}] under product-dev/
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists pd_projects_slug_idx on pd_projects (slug);

-- ── Provenance ───────────────────────────────────────────────────────────────
-- Created second because every table below cites it. `body` holds the email
-- VERBATIM and is never summarised — the structured columns elsewhere are
-- extracted FROM it, and it stays the ground truth when they disagree.

create table if not exists pd_sources (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references pd_projects(id) on delete cascade,  -- null = cross-project
  kind           text not null default 'email'
                 check (kind in ('email','call','whatsapp','meeting','datasheet','test_report','drawing','quote')),
  title          text not null,
  author_name    text,
  author_org     text,
  author_contact text,                            -- PII: phone / email as given
  recipient      text,
  received_at    date,
  body           text,                            -- verbatim, never summarised
  -- 'varies_by_supplier' exists so a caveat like "these press parameters depend
  -- on your own prepreg supplier" is queryable data instead of a sentence
  -- nobody can filter on.
  confidence     text not null default 'supplier_claim'
                 check (confidence in ('supplier_claim','quoted','confirmed','measured','estimate','varies_by_supplier')),
  supplier_id    uuid references hw_suppliers(id) on delete set null,
  external_ref   text,                            -- Message-ID, so a re-paste can dedupe
  files          jsonb not null default '[]',
  photos         jsonb not null default '[]',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);
create index if not exists pd_sources_project_idx  on pd_sources (project_id);
create index if not exists pd_sources_received_idx on pd_sources (received_at desc);

-- ── Commercial variants ──────────────────────────────────────────────────────
-- Rows rather than a check constraint, so a fourth construction is a UI action
-- and not a drop-constraint/add-constraint migration (the pain 114 documents).

create table if not exists pd_constructions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references pd_projects(id) on delete cascade,
  code        text not null,                      -- 'glass' | 'glass_carbon' | 'carbon'
  name        text not null,
  -- Free text on purpose: the supplier said "a very high proportion of
  -- fiberglass" and never quoted a percentage. Inventing one would corrupt the
  -- record it exists to preserve.
  description text,
  sort_order  int not null default 0,
  source_id   uuid references pd_sources(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (project_id, code)
);
create index if not exists pd_constructions_project_idx on pd_constructions (project_id, sort_order);

-- ── Physical tooling ─────────────────────────────────────────────────────────

create table if not exists pd_molds (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references pd_projects(id) on delete cascade,
  name                text not null,              -- "8.6" / "Tuttle base"
  kind                text not null default 'blade'
                      check (kind in ('blade','base','shell','insert','trim_jig')),
  key_dimension_mm    numeric,                    -- 8.3 / 8.6 / 9.1; null for a base mold
  key_dimension_label text not null default 'profile thickness at thickest point',
  plate_material      text default 'aluminium',
  plate_thickness_mm  numeric,                    -- 25
  has_alignment_pins  boolean not null default false,
  supplier_id         uuid references hw_suppliers(id) on delete set null,  -- who OWNS / made it
  holder_supplier_id  uuid references hw_suppliers(id) on delete set null,  -- who HAS it right now
  location_note       text,
  status              text not null default 'planned'
                      check (status in ('planned','ordered','in_use','shipped','retired')),
  photos              jsonb not null default '[]',
  notes               text,
  source_id           uuid references pd_sources(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz
);
create index if not exists pd_molds_project_idx on pd_molds (project_id);

comment on column pd_molds.key_dimension_mm is
  'The one dimension the mold is NAMED by. For a fin blade this is the profile thickness at the thickest point; for a board shell it is the length. Read key_dimension_label for which.';

-- ── Reinforcement catalog (global — no project_id) ───────────────────────────

create table if not exists pd_materials (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,       -- 'carbon-biax-200'
  name                text not null,              -- "200 g/m² biaxial carbon"
  fibre               text not null check (fibre in ('glass','carbon','aramid','flax','hybrid','none')),
  -- `form` is what separates a stage-1 prepreg from the dry fabrics, resin and
  -- forged carbon a stage-2 wet layup uses. One catalog, no split schema.
  form                text not null check (form in ('prepreg','dry_fabric','forged','resin','core','tape','adhesive')),
  weave               text check (weave in ('plain','twill','uni','biax','triax','chopped','none')),
  gsm                 numeric,
  -- FREE TEXT, deliberately unconstrained: the 200 g UNIDIRECTIONAL carbon was
  -- given to us as "0/90". That is what the source says, so that is what we
  -- store; a check constraint here would force us to "correct" the record.
  default_orientation text,
  diagram_color       text,                       -- hex — the layup diagram is a projection of these rows
  supplier_id         uuid references hw_suppliers(id) on delete set null,
  -- `active`, not archived_at: this table is global and referenced by plies via
  -- on-delete-restrict, so archiving a material still used by 18 plies would
  -- raise no error and would silently blank its colour on the diagram. Inactive
  -- just means "stop offering it in the picker".
  active              boolean not null default true,
  notes               text,                       -- keep the source's colour WORD here
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── Build-sheet header ───────────────────────────────────────────────────────

create table if not exists pd_layups (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pd_projects(id) on delete cascade,
  -- restrict, not cascade: archiving a construction must never silently
  -- vaporise its build sheets.
  construction_id uuid not null references pd_constructions(id) on delete restrict,
  -- NOT NULL is load-bearing. Postgres treats NULLs as distinct in a UNIQUE
  -- index, so a nullable mold_id would let unlimited (project, NULL, 'carbon')
  -- rows through and the constraint below would enforce nothing.
  mold_id         uuid not null references pd_molds(id) on delete restrict,
  name            text not null,                  -- "NP7 8.6 CARBON LAYUP 357"
  ref             text,                           -- '357' — TEXT: partner refs are not guaranteed numeric
  revision        int not null default 1,
  superseded_by   uuid references pd_layups(id) on delete set null,
  is_reference    boolean not null default false, -- the fin a quotation is based on
  resin_pct_min   numeric,
  resin_pct_max   numeric,
  -- fin: {rake_deg, back_end_mm, blade_length_cm}
  -- board: {length_cm, width_cm, volume_l, rocker_nose_mm, …}
  -- Field CATALOG lives in src/lib/product-dev.ts (git-reviewed); only values here.
  geometry        jsonb not null default '{}',
  files           jsonb not null default '[]',    -- [{key,name,kind}] .s3d/.brd/.stp/.dxf
  photos          jsonb not null default '[]',
  notes           text,
  source_id       uuid references pd_sources(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz,
  -- THE MATRIX. One build sheet per (construction, mold) pair; the pairs that
  -- have no row are the ones the factory does not build.
  unique (project_id, mold_id, construction_id)
);
create index if not exists pd_layups_project_idx on pd_layups (project_id);

-- ── The plies — the single most valuable record in this schema ───────────────

create table if not exists pd_layup_plies (
  id           uuid primary key default gen_random_uuid(),
  layup_id     uuid not null references pd_layups(id) on delete cascade,
  ply_index    int not null,                      -- 1..18, as printed on the drawing
  material_id  uuid not null references pd_materials(id) on delete restrict,
  orientation  text,                              -- null = inherit pd_materials.default_orientation
  -- TEXT and not an int: this is a CNC cut-template identifier, not a quantity,
  -- and it repeats across plies (7,7 … 9,9,9,9 … 12,12,12,12).
  template_ref text,
  length_cm    numeric,
  width_mm     numeric,
  -- Which stack this ply belongs to (the two sides of a blade; deck vs bottom
  -- on a board). Without it the ply-9 → ply-10 length reset can only be
  -- inferred at render time, and that inference breaks the moment somebody
  -- edits a length.
  stack        text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (layup_id, ply_index)
);
create index if not exists pd_layup_plies_layup_idx on pd_layup_plies (layup_id, ply_index);

comment on column pd_layup_plies.length_cm is
  'Ply length in cm. The taper across ply_index IS the bend curve of the part. It is NOT monotonic — it restarts at each new stack — so never sort or renumber these rows to "fix" it.';

-- ── Process ──────────────────────────────────────────────────────────────────

create table if not exists pd_processes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references pd_projects(id) on delete cascade,
  name            text not null,                  -- "Blade — prepreg press"
  stage_order     int not null default 1,
  method          text not null
                  check (method in ('cnc_cut','prepreg_press','wet_layup','infusion','bonding','finishing','qc')),
  summary         text,                           -- HTML
  construction_id uuid references pd_constructions(id) on delete set null,  -- null = applies to all
  source_id       uuid references pd_sources(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);
create index if not exists pd_processes_project_idx on pd_processes (project_id, stage_order);

create table if not exists pd_process_steps (
  id               uuid primary key default gen_random_uuid(),
  process_id       uuid not null references pd_processes(id) on delete cascade,
  step_no          int not null,
  title            text not null,
  body             text,                          -- the partner's VERBATIM wording, HTML
  equipment        text,
  -- Typed columns for the four parameters every composite process has, because
  -- these are what the dashboard filters and flags as stale. Anything rarer
  -- goes in `params`, so stage 1 (press, tonnes) and stage 2 (oven, hours) can
  -- share a table without either carrying a wall of the other's NULLs.
  temp_c_min       numeric,
  temp_c_max       numeric,
  pressure_t_min   numeric,
  pressure_t_max   numeric,
  duration_min     int,
  params           jsonb not null default '{}',
  materials        jsonb not null default '[]',   -- [{material_id, qty_note}] e.g. "2 × 600 g"
  critical         boolean not null default false,
  -- target/unit are NULLABLE and note is the one that is always filled:
  -- "maintain the fore-and-aft position of the blade" is a critical tolerance
  -- with no number, and must not be demoted to prose just because it lacks one.
  tolerance_target numeric,
  tolerance_unit   text,
  tolerance_note   text,
  photos           jsonb not null default '[]',
  source_id        uuid references pd_sources(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (process_id, step_no)
);
create index if not exists pd_process_steps_process_idx on pd_process_steps (process_id, step_no);

-- ── Seed: the reinforcement catalog ──────────────────────────────────────────
-- The four stage-1 prepregs (with the diagram colours the layup sheet uses) and
-- the four stage-2 wet-layup materials. Global, so a board project reuses them.

insert into pd_materials (slug, name, fibre, form, weave, gsm, default_orientation, diagram_color, notes) values
  ('glass-plain-350',      '350 g/m² plain-weave fiberglass',   'glass',  'prepreg',    'plain', 350, '0/90',   '#F2C230', 'Diagram colour: yellow'),
  ('carbon-plain-200',     '200 g/m² plain-weave carbon',       'carbon', 'prepreg',    'plain', 200, '-45/+45','#3FA34D', 'Diagram colour: green'),
  ('carbon-ud-200',        '200 g/m² unidirectional carbon',    'carbon', 'prepreg',    'uni',   200, '0/90',   '#6C5CE7', 'Diagram colour: violet. Orientation recorded verbatim as given ("0/90") despite being a UD fabric.'),
  ('carbon-biax-200',      '200 g/m² biaxial carbon',           'carbon', 'prepreg',    'biax',  200, '-45/+45','#E84393', 'Diagram colour: pink'),
  ('carbon-plain-200-dry', '200 g/m² plain-weave carbon (dry)', 'carbon', 'dry_fabric', 'plain', 200, null,     null,      'Stage 2 — cut dry, wet out in the base mold'),
  ('glass-600-dry',        '600 g/m² fiberglass (dry)',         'glass',  'dry_fabric', null,    600, null,     null,      'Stage 2 — 2 × 600 g per base'),
  ('forged-carbon',        'Forged carbon (chopped tow)',       'carbon', 'forged',     'chopped', null, null,  null,      'Stage 2 — mixed into epoxy and packed into the base mold'),
  ('epoxy-wet',            'Epoxy resin (wet layup)',           'none',   'resin',      'none',  null, null,    null,      'Stage 2 — liquid resin, not prepreg')
on conflict (slug) do nothing;

-- ── RLS: zero-policy enables (service role only, like migration 087) ─────────
-- Nothing here is ever rendered on a public or member page, and is_team_member()
-- would be far too coarse — it would hand the R&D base to every photographer.

alter table pd_projects      enable row level security;
alter table pd_sources       enable row level security;
alter table pd_constructions enable row level security;
alter table pd_molds         enable row level security;
alter table pd_materials     enable row level security;
alter table pd_layups        enable row level security;
alter table pd_layup_plies   enable row level security;
alter table pd_processes     enable row level security;
alter table pd_process_steps enable row level security;
