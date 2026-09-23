-- 258: Plate Designer projects.
--
-- Nico, 2026-09-23: "the plate builder needs a place to store projects that I
-- can open and save". A project is the plate (the tool's own design JSON,
-- exactly what its "Save design" button downloads), how the board was set up in
-- the tool (Shape3D layer and sliders, STL flipped or not), and the board file
-- itself, so opening a project brings back board and plate in one click.
--
-- The board file lives in the PRIVATE `documents` bucket under
-- product-dev/plate-designer/boards/{sha256}.{stl|s3dx}: named by its content,
-- so saving again or saving a copy never uploads the same board twice. It is
-- only ever handed out as a short-lived signed link.

set lock_timeout = '4s';

create table if not exists public.pd_plate_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  design jsonb not null,
  setup jsonb,
  board_file_path text,
  board_file_name text,
  board_file_kind text check (board_file_kind in ('stl', 's3dx')),
  board_file_size bigint,
  board_file_sha256 text,
  thumb text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists pd_plate_designs_recent_idx
  on public.pd_plate_designs (updated_at desc) where archived_at is null;

alter table public.pd_plate_designs enable row level security;
grant select, insert, update, delete on public.pd_plate_designs to service_role;

comment on table public.pd_plate_designs is
  'Plate Designer projects (Product Dev). design = the tool''s own board-plate-design JSON; setup = s3dx params / STL flip; board file in the private documents bucket.';

notify pgrst, 'reload schema';
