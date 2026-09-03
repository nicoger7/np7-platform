-- Migration 211: keep Experience money and Hardware money apart.
--
-- The two businesses are becoming separate companies, so they should not share
-- a planning vocabulary either: nobody budgeting a trip needs a 3PL line, and
-- nobody budgeting boards needs Reisevorleistungen. A category now belongs to a
-- division, and a NULL division means it belongs to both — rent, salaries and
-- bank fees are the same idea whichever company pays them.
--
-- Idempotent, additive-only.

alter table fin_categories
  add column if not exists division text;   -- 'experience' | 'hardware' | null = shared

comment on column fin_categories.division is
  'Which side of the business plans with this category. NULL means both.';

create index if not exists idx_fin_categories_division on fin_categories(division);

-- Experience: what a trip actually costs and earns. Reisevorleistungen is the
-- §25 margin-scheme input, so it can only ever be an Experience line.
update fin_categories set division = 'experience'
 where key in ('rev-experience', 'cost-travel-input', 'cost-coaches');

-- Hardware: goods, getting them here, getting them out, and designing them.
update fin_categories set division = 'hardware'
 where key in ('rev-hardware-d2c', 'rev-hardware-b2b', 'cost-goods',
               'cost-freight', 'cost-fulfilment', 'cost-rnd');

-- Everything else stays shared: personnel, freelancers, marketing, software,
-- rent, insurance, legal, bank, travel, depreciation, other income, other cost.
-- Left explicitly NULL rather than duplicated per division, so a shared cost is
-- one category in both plans and stays comparable across the group.
