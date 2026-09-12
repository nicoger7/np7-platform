-- Migration 241: the discipline of a board, as Nico names it.
--
-- pd_boards.category shipped in 238 with nine values and a generic name. The
-- discipline is the first thing anybody asks of a board ("we definitely have
-- to add the discipline of the boards we add"), so the vocabulary is widened
-- to the windsurf disciplines NP7 actually measures against, and the column
-- keeps its name — renaming it would touch every route for no gain; the
-- label in the UI is "Discipline".
--
-- Additive-only: every existing value stays valid.

alter table pd_boards drop constraint if exists pd_boards_category_check;
alter table pd_boards add constraint pd_boards_category_check
  check (category in (
    'slalom','freerace','freeride','freewave','wave','freestyle',
    'race','speed','formula','foil','wingfoil','sup','other'
  ));
