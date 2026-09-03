-- Migration 210: Budget planning — plan costs over time, record what really happened.
--
-- The shape: money passes through a PLAN (what we expect to spend, per month),
-- then an ACTUAL (the supplier's invoice, dated when the cost is INCURRED, not
-- when it is paid), and the two are joined by an allocation so one invoice can
-- answer to more than one planned line. That middle step is what a GmbH needs
-- and what exp_costs never had: it attaches payments straight to estimates.
--
-- lexoffice keeps the books. This is the planning layer that sits above them,
-- so fin_categories carries a lexoffice posting-category id rather than trying
-- to be a chart of accounts of its own.
--
-- Idempotent, additive-only. Nothing here touches exp_costs; its 241 rows stay
-- exactly where they are and can be carried over later.

-- ── The legal companies ───────────────────────────────────────────────────────
-- NP7 is becoming a group: a holding that currently runs Experience, a hardware
-- company being founded, and an Experience company from 2027-01-01. Every plan
-- and every actual belongs to exactly one of them, because each files its own
-- return. One lexoffice account maps to one company, so the org id lives here.
create table if not exists fin_entities (
  id             uuid primary key default gen_random_uuid(),
  key            text unique not null,
  name           text not null,
  legal_name     text,
  role           text not null default 'operating',   -- holding | operating
  division       text,                                -- experience | hardware | null
  status         text not null default 'active',      -- active | planned | archived
  active_from    date,
  active_to      date,
  lexoffice_org_id text,
  note           text,
  sort           int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Planning buckets ──────────────────────────────────────────────────────────
-- Deliberately NOT a chart of accounts. lexoffice owns SKR03/04 and the tax
-- treatment; this is the vocabulary Nico plans in, with a pointer across.
create table if not exists fin_categories (
  id             uuid primary key default gen_random_uuid(),
  key            text unique not null,
  name           text not null,
  kind           text not null check (kind in ('revenue','cost')),
  parent_id      uuid references fin_categories(id) on delete set null,
  lexoffice_category_id text,
  datev_account  text,
  sort           int  not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ── A budget, versioned ───────────────────────────────────────────────────────
-- Re-planning makes a new plan rather than overwriting the old one, so "what did
-- we think in January" survives contact with the year.
create table if not exists fin_plans (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid references fin_entities(id) on delete cascade,
  name           text not null,
  year           int  not null,
  status         text not null default 'draft' check (status in ('draft','active','archived')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_fin_plans_entity on fin_plans(entity_id, year);

-- ── The planned numbers ───────────────────────────────────────────────────────
-- One row is one expected amount in one month. A recurring cost is twelve rows,
-- which keeps every month independently editable — the whole point of a plan you
-- adapt. Amounts are NET: VAT is reclaimed, so it is not a cost.
create table if not exists fin_plan_lines (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references fin_plans(id) on delete cascade,
  category_id    uuid references fin_categories(id) on delete set null,
  label          text not null,
  month          date not null,                       -- always the 1st of the month
  amount_net     numeric not null default 0,
  vat_rate       numeric,
  -- what the money is for; an edition keeps trip P&L working
  cost_center_kind text,                              -- edition | product | overhead | null
  edition_id     uuid references exp_editions(id) on delete set null,
  vendor_id      uuid references vendors(id) on delete set null,
  confidence     text not null default 'expected',    -- committed | expected | possible
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_fin_plan_lines_plan  on fin_plan_lines(plan_id, month);
create index if not exists idx_fin_plan_lines_cat   on fin_plan_lines(category_id);
create index if not exists idx_fin_plan_lines_ed    on fin_plan_lines(edition_id);

-- ── What really happened ──────────────────────────────────────────────────────
-- The supplier's invoice. `incurred_on` is the invoice date and drives the P&L
-- period; `paid_on` is cash and drives nothing but the bank view. An actual with
-- no allocation is an unplanned cost, which is a finding, not an error.
create table if not exists fin_actuals (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid references fin_entities(id) on delete set null,
  category_id    uuid references fin_categories(id) on delete set null,
  vendor_id      uuid references vendors(id) on delete set null,
  description    text not null,
  document_number text,
  amount_net     numeric not null default 0,
  amount_vat     numeric,
  amount_gross   numeric,
  currency       text not null default 'EUR',
  incurred_on    date not null,
  due_on         date,
  paid_on        date,
  source_kind    text not null default 'manual',      -- manual | lexoffice_voucher | document | payment | exp_cost
  source_id      text,
  lexoffice_voucher_id text,
  file_path      text,                                -- the supplier PDF, private bucket
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_fin_actuals_entity on fin_actuals(entity_id, incurred_on);
create index if not exists idx_fin_actuals_cat    on fin_actuals(category_id);
create index if not exists idx_fin_actuals_lex    on fin_actuals(lexoffice_voucher_id);

-- ── Actual → plan line ────────────────────────────────────────────────────────
-- Same shape as migrations 056/057: a partial amount, so one hotel invoice can
-- answer to two editions' planned lines without being counted twice.
create table if not exists fin_actual_allocations (
  id             uuid primary key default gen_random_uuid(),
  actual_id      uuid not null references fin_actuals(id)     on delete cascade,
  plan_line_id   uuid not null references fin_plan_lines(id)  on delete cascade,
  amount         numeric not null default 0,
  created_at     timestamptz not null default now(),
  unique (actual_id, plan_line_id)
);
create index if not exists idx_fin_alloc_actual on fin_actual_allocations(actual_id);
create index if not exists idx_fin_alloc_line   on fin_actual_allocations(plan_line_id);

-- ── RLS: team only, like every other finance table ────────────────────────────
alter table fin_entities            enable row level security;
alter table fin_categories          enable row level security;
alter table fin_plans               enable row level security;
alter table fin_plan_lines          enable row level security;
alter table fin_actuals             enable row level security;
alter table fin_actual_allocations  enable row level security;

drop policy if exists "fin_entities team" on fin_entities;
create policy "fin_entities team" on fin_entities for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_categories team" on fin_categories;
create policy "fin_categories team" on fin_categories for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_plans team" on fin_plans;
create policy "fin_plans team" on fin_plans for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_plan_lines team" on fin_plan_lines;
create policy "fin_plan_lines team" on fin_plan_lines for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_actuals team" on fin_actuals;
create policy "fin_actuals team" on fin_actuals for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_alloc team" on fin_actual_allocations;
create policy "fin_alloc team" on fin_actual_allocations for all using (is_team_member()) with check (is_team_member());

-- ── Seed: the group as it stands today ────────────────────────────────────────
-- Hardware's legal name is still open (NP7 Group GmbH or NP7 Hardware GmbH), so
-- the key is stable and the name is not.
insert into fin_entities (key, name, legal_name, role, division, status, active_from, note, sort) values
  ('np7-gmbh',       'NP7 GmbH',        'NP7 GmbH', 'holding',   'experience', 'active',  null,         'Holding. Runs Experience operations until NP7 Experience GmbH takes over.', 1),
  ('np7-hardware',   'NP7 Hardware',    null,       'operating', 'hardware',   'planned', null,         'Being founded. Legal name undecided: NP7 Group GmbH or NP7 Hardware GmbH.', 2),
  ('np7-experience', 'NP7 Experience',  null,       'operating', 'experience', 'planned', '2027-01-01', 'Takes over Experience operations from 2027-01-01.', 3)
on conflict (key) do nothing;

-- ── Seed: planning categories, grounded in what NP7 actually spends on ────────
insert into fin_categories (key, name, kind, sort) values
  ('rev-experience',    'Experience revenue',            'revenue',  10),
  ('rev-hardware-d2c',  'Hardware revenue, direct',      'revenue',  20),
  ('rev-hardware-b2b',  'Hardware revenue, wholesale',   'revenue',  30),
  ('rev-other',         'Other income',                  'revenue',  90),

  ('cost-travel-input', 'Reisevorleistungen (hotels, centers, transfers)', 'cost', 100),
  ('cost-coaches',      'Coaches and guides',            'cost', 110),
  ('cost-goods',        'Goods purchased (hardware)',    'cost', 120),
  ('cost-freight',      'Freight, duty and landed cost', 'cost', 130),
  ('cost-fulfilment',   'Fulfilment and 3PL',            'cost', 140),
  ('cost-rnd',          'Product development',           'cost', 150),
  ('cost-personnel',    'Salaries and social charges',   'cost', 200),
  ('cost-freelance',    'Freelancers and contractors',   'cost', 210),
  ('cost-marketing',    'Marketing and advertising',     'cost', 300),
  ('cost-software',     'Software and tools',            'cost', 310),
  ('cost-rent',         'Rent and utilities',            'cost', 320),
  ('cost-insurance',    'Insurance',                     'cost', 330),
  ('cost-legal',        'Legal, tax and accounting',     'cost', 340),
  ('cost-bank',         'Bank and payment fees',         'cost', 350),
  ('cost-travel',       'Travel and representation',     'cost', 360),
  ('cost-depreciation', 'Depreciation',                  'cost', 400),
  ('cost-other',        'Other operating costs',         'cost', 900)
on conflict (key) do nothing;
