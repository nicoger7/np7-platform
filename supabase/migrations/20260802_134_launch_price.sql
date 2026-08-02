-- 134 · Launch price, per edition.
--
-- "2 weeks after website launch there's a launch-price" — edition-level on
-- purpose (Nico: "lets make it easy"): one percentage and one end date on the
-- week, applied to every package in it, shown struck-through on the site and
-- charged at reservation while the window is open. Nothing on the package rows
-- to keep in sync.
alter table exp_editions add column if not exists launch_discount_pct numeric;
alter table exp_editions add column if not exists launch_price_until date;
