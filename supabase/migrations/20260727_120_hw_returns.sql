-- Migration 120: returns / EU withdrawal flow (blueprint Phase 2, returns).
-- The withdrawal button (Directive 2023/2673, mandatory since 19 Jun 2026)
-- enters this pipeline; refunds go through the hw_order_transactions ledger,
-- restocks through the stock ledger. B-stock gets its own location.

-- Public token: the customer's key to their order page (tracking + returns).
alter table hw_orders add column if not exists public_token uuid not null default gen_random_uuid();
create unique index if not exists hw_orders_public_token_key on hw_orders (public_token);

create table if not exists hw_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references hw_orders(id) on delete cascade,
  type text not null default 'withdrawal' check (type in ('withdrawal','warranty','goodwill')),
  status text not null default 'requested'
    check (status in ('requested','approved','in_transit','received','resolved','rejected')),
  channel text not null default 'portal'
    check (channel in ('portal','withdrawal_button','email','admin')),
  declared_at timestamptz not null default now(),   -- legal clock starts here
  customer_message text,
  -- resolution figures, integer cents (mirror the money ledger)
  refund_shipping boolean not null default true,     -- withdrawal refunds outbound shipping
  refund_amount int,
  deduction_amount int not null default 0,           -- diminished-value deduction
  deduction_reason text,
  refund_transaction_id uuid references hw_order_transactions(id) on delete set null,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists hw_returns_order_idx on hw_returns (order_id);
create index if not exists hw_returns_status_idx on hw_returns (status);

create table if not exists hw_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references hw_returns(id) on delete cascade,
  order_line_id uuid not null references hw_order_lines(id) on delete cascade,
  quantity int not null check (quantity > 0),
  reason_code text,
  condition text check (condition in ('a_stock','b_stock','scrap')),   -- set at inspection
  restock boolean not null default false,
  restocked_at timestamptz,
  photos jsonb not null default '[]'
);
create index if not exists hw_return_lines_return_idx on hw_return_lines (return_id);

-- Returned-but-sellable-as-used gear lives apart from A-stock.
insert into hw_stock_locations (code, name, kind, is_virtual)
select 'BSTOCK', 'B-stock (returned)', 'own_storage', false
where not exists (select 1 from hw_stock_locations where code = 'BSTOCK');

alter table hw_returns enable row level security;
alter table hw_return_lines enable row level security;
