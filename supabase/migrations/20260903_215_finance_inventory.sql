-- Migration 215: buying stock is not a cost of sale.
--
-- The imported cost plan pays a factory 161,000 EUR for 230 boards while 50 are
-- sold in the window. Counted as cost of goods that produced a 10.9 % gross
-- margin, which is not a margin at all, it is the shape of an inventory
-- purchase. The Anmerkungen makes the same objection to the business plan as B7.
--
-- So goods bought for stock, and the freight and duty that land them, become
-- `inventory`: money out of the bank, and NOT a cost in the result until the
-- goods are sold.
--
-- Experience is deliberately untouched. Reisevorleistungen and coaches are
-- bought for one trip and consumed when it runs, so they are a true cost of
-- sale and stay in `cogs`. That difference is real: Hardware holds stock and
-- Experience does not.
--
-- Idempotent, additive-only.

comment on column fin_categories.pnl_group is
  'revenue | cogs | inventory | opex | development | financing. Inventory and financing move cash without touching the result.';

update fin_categories set pnl_group = 'inventory'
 where key in ('cost-goods', 'cost-freight');

-- Fulfilment is charged per sale, so it is recognised with the sale and stays
-- a cost of goods sold.
update fin_categories set pnl_group = 'cogs'
 where key = 'cost-fulfilment';
