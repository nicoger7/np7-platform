-- Migration 217: the roadmap. One timeline, fed by the things that already exist.
--
-- Design decisions worth keeping:
--
-- 1. POINTS AND SPANS in one table. `ends_on` null means a moment ("notarisation
--    on the 4th"), set means a stretch ("production, March to May"). Two tables
--    would double every query for no gain.
--
-- 2. SUBJECTS ARE REAL FOREIGN KEYS, not a (table, id) pair. A milestone can
--    hang off a product, an R&D project, a purchase order, a trip, a cost object
--    or a budget line, and every one of those is a proper reference the database
--    can enforce and cascade. A generic pair would have been shorter to write and
--    impossible to trust.
--
-- 3. LANES ARE DERIVED, never stored. The row a milestone sits on comes from the
--    subject it points at, so adding a product adds a lane and nothing has to be
--    kept in step by hand. That is what "deriving from our database" has to mean
--    if it is to stay true.
--
-- 4. A BASELINE. `baseline_*` holds the dates as first committed, so a milestone
--    that has been dragged shows its slippage instead of quietly becoming the
--    new truth. Same instinct as plan against actual in the budget.
--
-- 5. TWO-WAY BINDING. `source_table` / `source_field` name the column a milestone
--    was read from, so dragging the bar can write the date back to the purchase
--    order it came from rather than drifting away from it.
--
-- 6. DEPENDENCIES are their own table, because a roadmap without them is a
--    picture. Cycles are refused in the API; the database enforces what it can.

create table if not exists roadmap_items (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid references fin_entities(id) on delete cascade,
  title         text not null,
  kind          text not null default 'other'
                check (kind in ('tooling','production','shipping','funding','legal','launch','trip','hiring','other')),
  status        text not null default 'planned'
                check (status in ('planned','committed','done','at_risk','cancelled')),

  starts_on     date not null,
  ends_on       date,
  baseline_starts_on date,
  baseline_ends_on   date,

  -- what it belongs to; all optional, all enforced
  product_id        uuid references hw_products(id)         on delete set null,
  project_id        uuid references pd_projects(id)         on delete set null,
  purchase_order_id uuid references hw_purchase_orders(id)  on delete set null,
  edition_id        uuid references exp_editions(id)        on delete set null,
  cost_object_id    uuid references fin_cost_objects(id)    on delete set null,
  plan_line_id      uuid references fin_plan_lines(id)      on delete set null,

  source_table  text,
  source_field  text,
  amount_net    numeric,
  note          text,
  sort          int not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint roadmap_span_ordered check (ends_on is null or ends_on >= starts_on),
  constraint roadmap_baseline_ordered check (baseline_ends_on is null or baseline_starts_on is null
                                             or baseline_ends_on >= baseline_starts_on)
);

comment on column roadmap_items.ends_on is 'Null means a moment in time rather than a stretch.';
comment on column roadmap_items.baseline_starts_on is 'The date first committed to. Slippage is the gap to starts_on.';
comment on column roadmap_items.source_field is 'The column this was read from, so a drag can write back to it.';

create index if not exists idx_roadmap_entity   on roadmap_items(entity_id, starts_on);
create index if not exists idx_roadmap_product  on roadmap_items(product_id);
create index if not exists idx_roadmap_project  on roadmap_items(project_id);
create index if not exists idx_roadmap_po       on roadmap_items(purchase_order_id);
create index if not exists idx_roadmap_edition  on roadmap_items(edition_id);
create index if not exists idx_roadmap_object   on roadmap_items(cost_object_id);
create index if not exists idx_roadmap_planline on roadmap_items(plan_line_id);

-- One milestone per source column, so re-running a sync updates rather than
-- duplicates. Partial, because most rows are hand-made and have no source.
create unique index if not exists uniq_roadmap_source
  on roadmap_items(source_table, source_field, coalesce(purchase_order_id, plan_line_id, edition_id))
  where source_table is not null;

create table if not exists roadmap_dependencies (
  id             uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references roadmap_items(id) on delete cascade,
  successor_id   uuid not null references roadmap_items(id) on delete cascade,
  kind           text not null default 'finish_to_start'
                 check (kind in ('finish_to_start','start_to_start','finish_to_finish')),
  lag_days       int not null default 0,
  created_at     timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  constraint roadmap_no_self_dependency check (predecessor_id <> successor_id)
);
create index if not exists idx_roadmap_dep_pred on roadmap_dependencies(predecessor_id);
create index if not exists idx_roadmap_dep_succ on roadmap_dependencies(successor_id);

alter table roadmap_items        enable row level security;
alter table roadmap_dependencies enable row level security;
drop policy if exists "roadmap_items team" on roadmap_items;
create policy "roadmap_items team" on roadmap_items for all using (is_team_member()) with check (is_team_member());
drop policy if exists "roadmap_deps team" on roadmap_dependencies;
create policy "roadmap_deps team" on roadmap_dependencies for all using (is_team_member()) with check (is_team_member());

-- ── Seed: read the dates out of what already exists ──────────────────────────
-- Nothing is invented here. Every date below comes from a row somewhere else,
-- which is the point: the roadmap starts as a view of the truth and only then
-- becomes editable.

-- Purchase orders carry three real dates each.
insert into roadmap_items (entity_id, title, kind, starts_on, baseline_starts_on,
                           purchase_order_id, source_table, source_field, status)
select e.id, 'Order placed · ' || po.po_number, 'production', po.order_date, po.order_date,
       po.id, 'hw_purchase_orders', 'order_date', 'done'
  from hw_purchase_orders po
  cross join (select id from fin_entities where key = 'np7-hardware') e
 where po.order_date is not null and po.archived_at is null
on conflict do nothing;

insert into roadmap_items (entity_id, title, kind, starts_on, baseline_starts_on,
                           purchase_order_id, source_table, source_field, status)
select e.id, 'Ex factory · ' || po.po_number, 'production', po.ex_factory_planned, po.ex_factory_planned,
       po.id, 'hw_purchase_orders', 'ex_factory_planned', 'planned'
  from hw_purchase_orders po
  cross join (select id from fin_entities where key = 'np7-hardware') e
 where po.ex_factory_planned is not null and po.archived_at is null
on conflict do nothing;

insert into roadmap_items (entity_id, title, kind, starts_on, baseline_starts_on,
                           purchase_order_id, source_table, source_field, status)
select e.id, 'Goods expected · ' || po.po_number, 'shipping', po.expected_receipt_date, po.expected_receipt_date,
       po.id, 'hw_purchase_orders', 'expected_receipt_date', 'planned'
  from hw_purchase_orders po
  cross join (select id from fin_entities where key = 'np7-hardware') e
 where po.expected_receipt_date is not null and po.archived_at is null
on conflict do nothing;

-- The budget already knows when the money moves. Anything one-off and material
-- is a milestone; the monthly running costs are not.
insert into roadmap_items (entity_id, title, kind, starts_on, baseline_starts_on,
                           plan_line_id, cost_object_id, amount_net,
                           source_table, source_field, status, note)
select p.entity_id,
       l.label,
       case
         when l.label ilike '%mould%' or l.label ilike '%prototype%' or l.label ilike '%sample%' then 'tooling'
         when l.label ilike '%notary%' or l.label ilike '%register%' or l.label ilike '%legal%'
           or l.label ilike '%trade office%' then 'legal'
         when l.label ilike '%tranche%' or l.label ilike '%share capital%'
           or l.label ilike '%skodde%' or l.label ilike '%andersch%' then 'funding'
         when l.label ilike '%launch%' then 'launch'
         when l.label ilike '%freight%' or l.label ilike '%customs%' or l.label ilike '%air freight%' then 'shipping'
         else 'production'
       end,
       l.month, l.month, l.id, lo.cost_object_id, l.amount_net,
       'fin_plan_lines', 'month', 'planned',
       'Seeded from the budget. The date is the month it was planned in; drag it to the real day.'
  from fin_plan_lines l
  join fin_plans p on p.id = l.plan_id and p.status = 'active'
  left join fin_line_objects lo on lo.plan_line_id = l.id
 where l.amount_net >= 3000
   -- one-off only: a line that appears in a single month of its plan
   and (select count(*) from fin_plan_lines s
         where s.plan_id = l.plan_id and s.label = l.label) = 1
on conflict do nothing;
