-- ============================================================
-- 20260624_056_cost_allocations.sql
--   Split ONE cost across several editions by PERCENTAGE
--   (e.g. €600 coaching travel → Week I 60% / Week II 40%).
--   A cost with NO allocation row falls back to its single
--   exp_costs.edition_id at 100% — so existing costs are unaffected.
--   Drives the per-edition P&L (payments − allocated costs).
--   Additive + idempotent. Manual apply.
-- ============================================================

create table if not exists exp_cost_allocations (
  id         uuid primary key default gen_random_uuid(),
  cost_id    uuid not null references exp_costs(id)    on delete cascade,
  edition_id uuid not null references exp_editions(id) on delete cascade,
  percent    numeric not null default 0,               -- 0..100 share of the cost
  created_at timestamptz not null default now(),
  unique (cost_id, edition_id)
);
create index if not exists idx_cost_alloc_cost    on exp_cost_allocations(cost_id);
create index if not exists idx_cost_alloc_edition on exp_cost_allocations(edition_id);

alter table exp_cost_allocations enable row level security;
drop policy if exists "cost_alloc team" on exp_cost_allocations;
create policy "cost_alloc team" on exp_cost_allocations for all using (is_team_member()) with check (is_team_member());
