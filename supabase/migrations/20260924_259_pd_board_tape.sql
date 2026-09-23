-- 259: tape measurements kept on a board.
--
-- The 2D plan's tape measures on the plan at true scale. Nico, 2026-09-24:
-- "maybe i should be able to save some". Each entry is one measurement:
-- { a: { st, off }, b: { st, off }, label, saved_at } with st in cm from the
-- board's station origin and off in cm off the centreline (+ = the upper side
-- in the plan). What the tape read is recomputed from the points, never stored.

set lock_timeout = '4s';

alter table public.pd_boards add column if not exists tape jsonb not null default '[]'::jsonb;

comment on column public.pd_boards.tape is
  'Saved tape measurements from the 2D plan: [{a:{st,off}, b:{st,off}, label, saved_at}], cm.';

notify pgrst, 'reload schema';
