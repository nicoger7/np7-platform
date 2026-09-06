-- 229 · A budget line that works itself out
--
-- Some costs are not a number somebody decided, they are a rule. Nico's
-- sponsor replacement fee is 5% of sales. The payment and fulfilment fee is 9%.
-- The shaper is moving from a salary to a royalty. Every one of those is wrong
-- the moment the sales figure moves, and every one of them was being kept right
-- by a script re-running and rewriting twelve rows.
--
-- So a line can carry a rule instead. `amount_net` stays as the last computed
-- value, so anything reading the table directly still sees a number, but the
-- board recomputes it from the revenue it has just worked out.
--
-- Only costs may be driven by revenue. A revenue line driven by revenue would
-- be a loop, and the board refuses it rather than trying to be clever.
alter table fin_plan_lines add column if not exists driver_kind  text;
alter table fin_plan_lines add column if not exists driver_value numeric;

alter table fin_plan_lines drop constraint if exists fin_plan_lines_driver_kind_check;
alter table fin_plan_lines add constraint fin_plan_lines_driver_kind_check
  check (driver_kind is null or driver_kind in ('pct_of_revenue', 'pct_of_units'));

comment on column fin_plan_lines.driver_kind is
  'null = the amount is what somebody typed. pct_of_revenue = driver_value% of the plan''s revenue that month. pct_of_units = per unit sold.';
comment on column fin_plan_lines.driver_value is
  'The percentage, or the amount per unit. Read with driver_kind, meaningless alone.';
