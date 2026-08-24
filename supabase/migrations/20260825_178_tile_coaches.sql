-- Per-experience crew override for the auto-branded tile (array of
-- exp_coaches ids, display order, lead first). NULL/empty = automatic:
-- the card fronts the NEXT week's team. The card is experience-level while
-- teams are per-week — a week with one coach starved the card of its
-- second cutout even when the experience has more coaches (Nico, 2026-08-25).
alter table exp_content add column if not exists tile_coaches jsonb;
