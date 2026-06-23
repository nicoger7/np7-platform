-- ============================================================
-- 20260624_057_cost_payment_links.sql
--   Attach actual expense payments (exp_payments direction='cost') to a
--   cost line, with amounts — so a cost's ACTUAL = Σ attached payments.
--   Supports partial (amount < payment) and many↔many: one payment split
--   across several costs, and several payments on one cost. Manual
--   exp_costs.actual_amount stays as a fallback/override.
--   Additive + idempotent. Manual apply.
-- ============================================================

create table if not exists exp_cost_payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  cost_id    uuid not null references exp_costs(id)     on delete cascade,
  payment_id uuid not null references exp_payments(id)  on delete cascade,
  amount     numeric not null default 0,               -- portion of the payment on this cost
  created_at timestamptz not null default now(),
  unique (cost_id, payment_id)
);
create index if not exists idx_costpay_cost    on exp_cost_payment_allocations(cost_id);
create index if not exists idx_costpay_payment on exp_cost_payment_allocations(payment_id);

alter table exp_cost_payment_allocations enable row level security;
drop policy if exists "costpay team" on exp_cost_payment_allocations;
create policy "costpay team" on exp_cost_payment_allocations for all using (is_team_member()) with check (is_team_member());
