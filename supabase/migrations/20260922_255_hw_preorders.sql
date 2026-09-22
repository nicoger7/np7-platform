-- 255: pre-orders for hardware.
--
-- Nico's rule of 22.09.2026: one deposit rule for everyone, 30% with the order.
-- And pre-ordering is a PERIOD, never a fixed date: dealers order first, because
-- their orders size the production run, and riders fill what is left of it.
--
-- A pre-order deliberately does NOT reserve stock. The boards do not exist yet:
-- the pre-order is the demand that decides what to build, which is why the
-- dealer window has to close before the factory order goes in.

create table if not exists hw_preorder_windows (
  id uuid primary key default gen_random_uuid(),
  season int not null,                                   -- the season the boards are for, e.g. 2027
  audience text not null check (audience in ('dealer', 'rider')),
  label text,
  opens_on date not null,
  closes_on date not null,
  discount_pct numeric not null default 0
    check (discount_pct >= 0 and discount_pct < 1),       -- what ordering early earns
  deposit_kind text not null default 'amount'
    check (deposit_kind in ('pct', 'amount')),            -- 30% for a dealer, a flat 500 for a rider
  deposit_value numeric not null default 0 check (deposit_value >= 0),
  balance_due text not null default 'on_dispatch'
    check (balance_due in ('on_dispatch', 'on_arrival', 'before_shipping')),
  ships_from date,                                        -- when the boards are expected to land
  note text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint hw_preorder_window_span check (closes_on >= opens_on)
);

-- one live window per season and audience; archived ones do not count
create unique index if not exists hw_preorder_windows_season_audience_idx
  on hw_preorder_windows (season, audience) where archived_at is null;
create index if not exists hw_preorder_windows_dates_idx
  on hw_preorder_windows (opens_on, closes_on);

alter table hw_preorder_windows enable row level security;   -- service role only, like every hw_ table

alter table hw_orders
  add column if not exists order_kind text not null default 'stock',
  add column if not exists preorder_window_id uuid references hw_preorder_windows(id) on delete set null,
  add column if not exists deposit_cents int,              -- what was taken with the order
  add column if not exists balance_due_at date;            -- when the rest falls due

alter table hw_orders drop constraint if exists hw_orders_order_kind_check;
alter table hw_orders add constraint hw_orders_order_kind_check
  check (order_kind in ('stock', 'preorder'));

-- a deposit paid is a real state: money in, balance still owed
alter table hw_orders drop constraint if exists hw_orders_payment_status_check;
alter table hw_orders add constraint hw_orders_payment_status_check
  check (payment_status in ('awaiting', 'authorized', 'deposit_paid', 'paid',
                            'partially_refunded', 'refunded', 'canceled', 'failed'));

create index if not exists hw_orders_preorder_idx on hw_orders (order_kind, preorder_window_id);

-- The 2027 season, as agreed. Both start as drafts: nothing opens until Nico says so.
insert into hw_preorder_windows
  (season, audience, label, opens_on, closes_on, discount_pct, deposit_kind, deposit_value,
   balance_due, ships_from, status, note)
select 2027, 'dealer', 'Dealer pre-order 2027', date '2026-09-01', date '2026-10-31',
       0.03, 'pct', 0.30, 'on_arrival', date '2027-03-01', 'draft',
       'Europe pays the balance when the boards arrive. Worldwide dealers pay before the boards leave the factory.'
where not exists (select 1 from hw_preorder_windows where season = 2027 and audience = 'dealer');

insert into hw_preorder_windows
  (season, audience, label, opens_on, closes_on, discount_pct, deposit_kind, deposit_value,
   balance_due, ships_from, status, note)
select 2027, 'rider', 'Rider pre-order 2027', date '2026-11-01', date '2026-12-20',
       0.10, 'amount', 500, 'on_dispatch', date '2027-03-01', 'draft',
       'Opens after the dealer window closes, so the run is already sized. 500 EUR holds a board, the rest is due when it ships.'
where not exists (select 1 from hw_preorder_windows where season = 2027 and audience = 'rider');
