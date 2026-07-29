-- Focal point for a product's hero image (CSS object-position, e.g. "50% 40%")
-- so the same photo crops correctly on wide desktop banners and tall phones.
alter table public.hw_product_content add column if not exists hero_focus text;
