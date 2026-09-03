-- Migration 213: make the budget produce a P&L, not a list of costs.
--
-- The NP7 business plan is the reference for what a budget has to answer:
-- revenue, then cost of goods, then gross profit and gross margin, then
-- operating and development costs, then the result, and underneath all of it a
-- running cash position. A single "cost" bucket cannot produce any of that.
--
-- So a category also says WHERE IT SITS in the P&L. `kind` stays what it is
-- (money in or money out, which the grid groups by); `pnl_group` is the line it
-- rolls into.
--
-- Idempotent, additive-only.

alter table fin_categories
  add column if not exists pnl_group text;

comment on column fin_categories.pnl_group is
  'Where the category sits in the P&L: revenue | cogs | opex | development. Drives gross profit and the margins.';

create index if not exists idx_fin_categories_pnl on fin_categories(pnl_group);

update fin_categories set pnl_group = 'revenue' where kind = 'revenue';

-- Cost of goods: what a sold unit or a delivered trip directly costs us.
-- Reisevorleistungen belongs here and not in overheads: it is the bought-in
-- hotel and centre for a specific trip, and it is the same figure the §25
-- margin is calculated on.
update fin_categories set pnl_group = 'cogs'
 where key in ('cost-travel-input', 'cost-coaches', 'cost-goods', 'cost-freight', 'cost-fulfilment');

-- Development is carried separately because the business plan does: molds,
-- shapes and pre-production samples are neither cost of a sold board nor
-- ordinary overhead, and they fall away once a range is finished.
update fin_categories set pnl_group = 'development'
 where key in ('cost-rnd');

-- Everything else keeps the company running whether or not anything sells.
update fin_categories set pnl_group = 'opex'
 where pnl_group is null and kind = 'cost';
