-- Migration 214: money that comes in without being earned.
--
-- The Sep 2026 to May 2027 cost plan puts 437,500 EUR through the company that
-- is not revenue: 12,500 share capital at incorporation, two investor tranches
-- of 100,000 in October, and 225,000 in March 2027. It moves the bank balance
-- and it must never touch the result or a margin.
--
-- Without a place to put it there are only two options, and both lie: book it
-- as revenue and the company shows a fake profit at a 100 % margin, or leave it
-- out and the cash line runs deeply negative while the account is full.
--
-- So `financing` becomes a fourth P&L group. It sits outside the result and
-- inside the cash position, exactly as the cost plan's own Cash Flow sheet has
-- it.
--
-- Idempotent, additive-only.

comment on column fin_categories.pnl_group is
  'Where the category sits: revenue | cogs | opex | development | financing. Financing is outside the result and inside the cash position.';

-- kind stays 'revenue' because it is money IN and the grid groups by that.
-- pnl_group is what keeps it out of the margins.
insert into fin_categories (key, name, kind, pnl_group, division, sort) values
  ('fin-share-capital', 'Share capital',    'revenue', 'financing', null, 5),
  ('fin-investment',    'Investor tranche', 'revenue', 'financing', null, 6),
  ('fin-loan',          'Loans received',   'revenue', 'financing', null, 7)
on conflict (key) do update
  set pnl_group = excluded.pnl_group,
      name      = excluded.name,
      sort      = excluded.sort;
