-- 224 · Where a budget line comes from, and what it was promised to be
--
-- Two gaps, and they are the same gap seen from either end.
--
-- 1. Everything in the budget was typed. But the truth about a supplier
--    commitment already lives in hw_po_payments, and the truth about a trip's
--    costs already lives in exp_costs. Copying those into budget rows would
--    create a second copy that drifts. So nothing is copied: a plan line can
--    NAME its sources, and the committed and actual figures are read from them
--    at the moment the board is built.
--
-- 2. A plan that is edited in place has no memory. Once you move a number, the
--    number you were measured against is gone. So the plan can be frozen: every
--    line keeps what it said on the day it was approved, and from then on the
--    live amount is a forecast and the difference between them is visible.

-- ── A budget line names its sources ──────────────────────────────────────────
-- share is there for the honest case where one deposit covers two planned
-- lines. It is a percentage of the SOURCE, not of the line.
create table if not exists fin_source_links (
  id             uuid primary key default gen_random_uuid(),
  plan_line_id   uuid not null references fin_plan_lines(id) on delete cascade,
  source_table   text not null check (source_table in (
                   'exp_costs', 'exp_payments', 'hw_po_payments', 'hw_po_lines',
                   'hw_receipts', 'hw_shipment_costs', 'hw_orders', 'documents')),
  source_id      uuid not null,
  share          numeric not null default 100 check (share > 0 and share <= 100),
  note           text,
  created_at     timestamptz not null default now(),
  unique (plan_line_id, source_table, source_id)
);
create index if not exists idx_fin_source_links_line on fin_source_links(plan_line_id);
create index if not exists idx_fin_source_links_src  on fin_source_links(source_table, source_id);

alter table fin_source_links enable row level security;
drop policy if exists fin_source_links_staff on fin_source_links;
create policy fin_source_links_staff on fin_source_links
  for all to authenticated
  using (exists (select 1 from team_members t where t.auth_user_id = auth.uid()))
  with check (exists (select 1 from team_members t where t.auth_user_id = auth.uid()));

-- ── Freezing a budget ────────────────────────────────────────────────────────
-- baseline_amount null means the line has never been frozen, which is different
-- from a baseline of zero. Reading code must treat them differently.
alter table fin_plans      add column if not exists baseline_at   timestamptz;
alter table fin_plans      add column if not exists baseline_by   text;
alter table fin_plan_lines add column if not exists baseline_amount numeric;

comment on table  fin_source_links is
  'A planned line pointing at the record that will make it real. Read, never copied.';
comment on column fin_plans.baseline_at is
  'When this plan was approved. After this the amounts are a forecast; baseline_amount is the budget.';
comment on column fin_plan_lines.baseline_amount is
  'What this line said when the plan was frozen. Null = never frozen, which is not the same as zero.';
