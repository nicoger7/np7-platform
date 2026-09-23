-- 257: web research on a board.
--
-- Nico, 2026-09-23: "a new tab with a button that can search the web for
-- relevant info (and what people say about this board pros/cons)". The last
-- run is kept on the board itself: official specs, pros and cons with their
-- sources, links. Re-running replaces it. Written only when somebody presses
-- the button; the specs it finds are never copied onto the board by itself.

set lock_timeout = '4s';

alter table public.pd_boards add column if not exists research jsonb;
alter table public.pd_boards add column if not exists research_at timestamptz;

comment on column public.pd_boards.research is
  'Last web research run: specs, pros/cons with source URLs, links (see BoardResearch in src/lib/board-measurements.ts).';

notify pgrst, 'reload schema';
