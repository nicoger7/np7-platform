-- Migration 238: Board measurements — the shape half of Product Development.
--
-- Migration 129 records how a product is BUILT (mold → layup → plies). This
-- records what it IS: the numbers you read off a board with a straightedge and
-- a caliper. Our own prototypes, and the competitor boards worth copying from.
--
-- Shape notes worth knowing before you edit anything here:
--
--   * Measurements are a SPARSE LONG table, not columns. Every real measuring
--     session is ragged — thickness read at one station, width at nine, rocker
--     at six, and the next board measured at different stations entirely. A
--     wide table would be a wall of NULLs whose column list has to grow every
--     time somebody adds a station; this shape stores exactly what was read.
--
--   * pd_board_series is per-board, per-metric SETTINGS, and it is the reason
--     the raw numbers stay raw. A tape note like "V — inverted!! (alles
--     halbieren)" carries three separate facts: the metric, that the series is
--     signed the other way, and that the readings are double the per-side
--     figure. `convention` keeps the sentence verbatim, `scale` and `variant`
--     make the two mechanical parts of it computable. Nothing rewrites the
--     numbers in pd_board_points — a value there is always what was read.
--
--   * V is ONE signed series, not two. Inverted V forward of the mast and
--     normal V behind it is a single continuous curve through zero, which is
--     also physically what the bottom does. Splitting it into two metrics
--     would hide the crossover station, which is the interesting number.
--
--   * `station` is measured from pd_boards.station_origin (default: the tail).
--     Stored per board because half the shaper world measures from the nose.
--
-- Additive-only; RLS zero-policy (service role only — same pattern as 129).

-- ── The board ────────────────────────────────────────────────────────────────

create table if not exists pd_boards (
  id             uuid primary key default gen_random_uuid(),
  -- Optional: a measured competitor board belongs to no R&D program, and a
  -- program exists long before there is a board to measure.
  project_id     uuid references pd_projects(id) on delete set null,
  name           text not null,                   -- "FMX 2026 Slalom 85"
  brand          text,
  model          text,
  year           int,
  category       text not null default 'slalom'
                 check (category in ('slalom','freerace','freeride','wave','freestyle','foil','formula','sup','other')),
  -- Whose board this is. Drives nothing yet; it is the first question anybody
  -- asks of a row in this table.
  origin         text not null default 'reference'
                 check (origin in ('own','prototype','competitor','reference')),
  volume_l       numeric,
  length_cm      numeric,
  -- The overall widest point, which is NOT the widest bottom reading: the
  -- `width` series measures the flat bottom between the rails. Both are useful
  -- and they are different numbers, so both have a home.
  max_width_cm   numeric,
  tail_width_cm  numeric,
  weight_kg      numeric,
  construction   text,
  fin_box        text,
  station_origin text not null default 'tail' check (station_origin in ('tail','nose')),
  station_unit   text not null default 'cm'   check (station_unit in ('cm','mm','in')),
  -- The grid the entry table draws: which stations get a row, per board.
  -- "measurement points could be a bit different from board to board."
  stations       jsonb not null default '[]',
  measured_at    date,
  measured_by    text,
  summary        text,
  notes          text,
  photos         jsonb not null default '[]',     -- [{key,caption,w,h}] under product-dev/
  source_id      uuid references pd_sources(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);
create index if not exists pd_boards_project_idx on pd_boards (project_id);
create index if not exists pd_boards_name_idx    on pd_boards (name);

-- ── Per-metric settings ──────────────────────────────────────────────────────
-- One row per metric actually measured on this board. Absent row = the metric
-- was never read, which is different from "read as zero".

create table if not exists pd_board_series (
  board_id   uuid not null references pd_boards(id) on delete cascade,
  -- Not a check constraint: the metric catalog lives in
  -- src/lib/board-measurements.ts, where adding one is a reviewable one-line
  -- PR instead of a migration. Same catalog-in-git rule as GEOMETRY_FIELDS.
  metric     text not null,
  unit       text,                                -- overrides the catalog unit
  -- 'double' / 'single' concave, 'inverted' V, 'tucked' rails — the sub-kind
  -- the catalog offers for this metric.
  variant    text,
  -- "alles halbieren": the tape read the full rail-to-rail drop, the number
  -- that matters is half of it. A DISPLAY factor — pd_board_points keeps what
  -- was read, so the convention can be corrected later without re-measuring.
  scale      numeric not null default 1,
  -- What the readings were taken against, when it isn't the flat reference:
  -- Nico's double-concave figures are "minus the inverted V". Holds another
  -- metric key; the drawing subtracts that series instead of guessing.
  relative_to text,
  convention text,                                -- the tape note, verbatim
  enabled    boolean not null default true,
  sort_order int not null default 0,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board_id, metric)
);

-- ── The readings ─────────────────────────────────────────────────────────────

create table if not exists pd_board_points (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references pd_boards(id) on delete cascade,
  metric     text not null,
  station    numeric not null,                    -- in pd_boards.station_unit
  -- Nullable on purpose: a station with no reading yet is a real, useful row —
  -- it is the list of points you still have to go back and measure.
  value      numeric,
  -- Rail shape is a pick from a vocabulary, not a number; a few readings are a
  -- word ("start"). Both live here rather than in a second table.
  text_value text,
  note       text,                                -- "start", "normal V from here"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, metric, station)
);
create index if not exists pd_board_points_board_idx on pd_board_points (board_id, metric, station);

-- ── Cut-outs and fittings ────────────────────────────────────────────────────
-- Two things share this table because they share one question — "where along
-- the board, and how far off the centreline":
--
--   * The cut-outs proper: recessed areas in the underwater hull that cut
--     wetted surface and let the flow separate where you want it to. On a
--     slalom board these sit in the tail, in a mirrored pair.
--   * The fittings: fin box, mast track, strap inserts, vent.
--
-- station_from/station_to rather than station+length, because everything here
-- is a RUN along the board — a Deep Tuttle box is 30-odd cm of it — and the two
-- ends are what you actually measure with the tape hooked on the tail.

create table if not exists pd_board_cutouts (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references pd_boards(id) on delete cascade,
  kind         text not null default 'tail_cutout'
               check (kind in ('tail_cutout','step','channel','fin_box','mast_track','footstrap','vent','handle','other')),
  label        text,                              -- "front strap, inboard"
  station_from numeric,                           -- from pd_boards.station_origin
  station_to   numeric,
  -- Centre of it, from the centreline. Signed, so an asymmetric feature is
  -- expressible; `mirrored` covers the usual case of a matched pair without
  -- making you type the row twice.
  offset_cm    numeric,
  mirrored     boolean not null default false,
  width_cm     numeric,
  -- Depth of the recess, or of the box. Nullable: a strap insert has a
  -- position and no meaningful depth.
  depth_mm     numeric,
  angle_deg    numeric,
  spec         text,                              -- "Deep Tuttle", "M8 × 20"
  notes        text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists pd_board_cutouts_board_idx on pd_board_cutouts (board_id, sort_order);

-- ── Notes, typed or spoken ───────────────────────────────────────────────────
-- You measure a board with both hands busy. This is the dictation inbox: the
-- raw note is kept forever, the tidy-up is a separate column, and anything it
-- proposes to write into the board waits in `proposal` until a human says yes.

create table if not exists pd_board_notes (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references pd_boards(id) on delete cascade,
  kind       text not null default 'text' check (kind in ('text','voice')),
  body       text,                                -- typed text, or the transcript
  audio_key  text,                                -- storage key under product-dev/
  duration_s int,
  status     text not null default 'raw'
             check (status in ('raw','sorted','applied','discarded')),
  -- What the sorter made of it: {summary, bullets[], proposals[]}. Never
  -- applied automatically — /boards/:id/intake returns it, a person imports it.
  filed      jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pd_board_notes_board_idx on pd_board_notes (board_id, created_at desc);

-- ── RLS: zero-policy enables (service role only, like 129) ───────────────────
-- Competitor measurements and our own prototype numbers are the same class of
-- secret as the layup sheets, and reach is gated by the pd_boards section in
-- src/lib/access.ts — not by a policy that would hand them to every staffer.

alter table pd_boards         enable row level security;
alter table pd_board_series   enable row level security;
alter table pd_board_points   enable row level security;
alter table pd_board_cutouts  enable row level security;
alter table pd_board_notes    enable row level security;

-- ── The building process, attached to a board ────────────────────────────────
-- pd_processes / pd_process_steps (migration 129) already model "step by step,
-- with parameters, materials, tolerances and photos", and they have had a full
-- API since day one — they were simply never given a tab in the UI. So the
-- building process for a board reuses them rather than growing a second,
-- almost-identical pair of tables that would drift apart within a month.
--
-- Two changes make that possible:

-- 1. A process may now hang off a BOARD instead of a project. project_id has to
--    lose its NOT NULL for that; the check keeps every row owned by exactly one
--    of the two, so "a process belonging to nothing" stays unrepresentable.
alter table pd_processes add column if not exists board_id uuid references pd_boards(id) on delete cascade;
alter table pd_processes alter column project_id drop not null;
do $$ begin
  alter table pd_processes add constraint pd_processes_one_owner
    check ((project_id is not null) <> (board_id is not null));
exception when duplicate_object then null; end $$;
create index if not exists pd_processes_board_idx on pd_processes (board_id, stage_order);

-- 2. Sub-sections. A stage like "Lamination" runs to thirty steps, and a flat
--    numbered list of thirty is not a process anybody can follow. `section` is
--    a free-text heading a run of consecutive steps shares — the middle level
--    between the stage and the step, added as a label rather than a table
--    because it has no properties of its own and never needs to be referenced.
alter table pd_process_steps add column if not exists section text;
-- Photos already exist on a step. This is the one-per-step HERO: the picture
-- you look at instead of reading, pinned to the top of the card.
alter table pd_process_steps add column if not exists hero_photo text;

-- ── Which layup is which MODEL ───────────────────────────────────────────────
-- Asked directly: "is it clear that different lay-up = different model?" It was
-- not. A build sheet is unique on (project, mold, construction), but the only
-- link to a sellable product sat on pd_projects — ONE per program — so the
-- glass fin and the carbon fin off the same mold could not each be their own
-- model, and nothing anywhere carried a model NAME. The sheet's `name` is a
-- factory reference ("NP7 GLASS LAYUP 931"), not something a customer buys.
--
-- Modelled at BOTH levels on purpose, because the answer differs per program:
--   * construction = model is the usual case — glass and carbon off one mold
--     are two products.
--   * layup = model is the exception — when one specific (mold, construction)
--     pair is sold as its own thing.
-- Resolution is layup → construction → project name, so filling in neither
-- leaves today's behaviour exactly as it is.
alter table pd_constructions add column if not exists model_name text;
alter table pd_constructions add column if not exists hw_product_id uuid references hw_products(id) on delete set null;
alter table pd_layups       add column if not exists model_name text;

comment on column pd_constructions.model_name is
  'The sellable model this construction IS, when the construction is the model axis (the usual case for fins: glass vs carbon off the same mold are two products). Falls back to the project name.';
comment on column pd_layups.model_name is
  'Override, for when one specific (mold, construction) pair is its own model. Resolution order: layup.model_name, then its construction, then the project name.';

-- ── Reach: nobody who could see build sheets loses the boards ────────────────
-- Custom roles store section grants as an explicit map, and an unlisted key
-- resolves to 'none' (roleSectionLevel in src/lib/access.ts). A brand-new
-- section is therefore invisible to every role-holder — the Owner ROLE
-- included — until somebody opens the role editor. Copying pd_knowledge's level
-- across keeps reach exactly where it was; a role that never had the R&D world
-- gets nothing, which is also right.
update team_roles
   set access = jsonb_set(access, '{sections,pd_boards}', access->'sections'->'pd_knowledge'),
       updated_at = now()
 where access->'sections' ? 'pd_knowledge'
   and not (access->'sections' ? 'pd_boards');
