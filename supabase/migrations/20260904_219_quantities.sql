-- Migration 219: units, so a range can say what one of them costs.
--
-- Cost objects answer "what did Boards cost us": €161,000. They cannot answer
-- "what does a board cost us", which is the question actually asked, because
-- nothing in the plan records how many.
--
-- Two counts, not one. You buy 230 boards and sell 50 of them in the same
-- window, so a single quantity column averaged across both sides would produce
-- a unit cost and a unit price that are each wrong. The side is decided by the
-- line's own pnl_group: units on a revenue line are units SOLD, units on a cost
-- or inventory line are units BOUGHT.
--
-- ⚠ On a split payment, put the quantity on ONE line. A deposit and a balance
-- for the same 230 boards are two lines and one order; quantity on both would
-- count 460. The seed below follows that rule and puts it on the final payment.
--
-- Idempotent, additive-only.

alter table fin_plan_lines add column if not exists quantity numeric;
alter table fin_actuals    add column if not exists quantity numeric;

comment on column fin_plan_lines.quantity is
  'How many units this line covers. On a split payment, set it on one line only or the count doubles. Side (bought/sold) comes from the category''s pnl_group.';
comment on column fin_actuals.quantity is
  'How many units this cost covers. Same one-line rule as fin_plan_lines.quantity.';

-- ── Seed the quantities the cost plan's own assumptions state ────────────────
-- Every number below is from the Assumptions sheet of
-- NP7_Cost_Plan_Sep2026-May2027.xlsx, not invented:
--   230 boards at 700 landed · 100 fins at 180 + 17 freight
--   50 boards pre-ordered at ~2,015 net · 100 fins sold at 400 net
-- Quantity sits on the final payment of each pair so nothing is counted twice.

update fin_plan_lines set quantity = 230 where label ilike 'Balance before shipping%';
update fin_plan_lines set quantity = 100 where label ilike 'First order 100 fins - balance%';
update fin_plan_lines set quantity = 50  where label ilike 'Board balances on delivery%';
-- Fin revenue is TWO lines, 50 sold in January and 50 in February, so each
-- carries 50. Setting 100 on both would sell 200 fins out of an order of 100.
update fin_plan_lines set quantity = 50 where label ilike 'Performance fins%'
  and exists (select 1 from fin_categories c where c.id = fin_plan_lines.category_id and c.kind = 'revenue');
