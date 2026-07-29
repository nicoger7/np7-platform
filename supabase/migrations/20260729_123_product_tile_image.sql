-- The card/tile image is its own crop decision: a wide hero rarely works as a
-- narrow shop card. Optional — empty falls back to the hero image/focus.
alter table public.hw_product_content add column if not exists tile_image text;
alter table public.hw_product_content add column if not exists tile_focus text;
