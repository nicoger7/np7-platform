-- Migration 118: D2C orders core (blueprint Phase 2, decision-independent part).
-- The five locked architecture decisions apply:
--   · three orthogonal statuses (order / payment / fulfillment), never one enum
--   · money is integer CENTS; refunds are signed ledger rows, never edits
--   · order → n fulfillments (→ n invoices later); partials everywhere
--   · everything customer-facing is snapshotted onto the order
-- Checkout/Stripe lands in the next increment; hw_checkouts here is the anchor.

-- ── Checkouts (minimal anchor; the cart shape arrives with the public shop) ──
create table if not exists hw_checkouts (
  id uuid primary key default gen_random_uuid(),
  email text,
  currency char(3) not null default 'EUR',
  status text not null default 'open' check (status in ('open','completed','abandoned')),
  cart jsonb not null default '[]',
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Orders ───────────────────────────────────────────────────────────────────
create sequence if not exists hw_order_number_seq start 10001;

create table if not exists hw_orders (
  id uuid primary key default gen_random_uuid(),
  display_number bigint not null unique default nextval('hw_order_number_seq'),
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  phone text,
  currency char(3) not null default 'EUR',
  locale text,
  status text not null default 'pending'
    check (status in ('pending','completed','canceled')),
  payment_status text not null default 'awaiting'
    check (payment_status in ('awaiting','authorized','paid','partially_refunded','refunded','canceled','failed')),
  fulfillment_status text not null default 'unfulfilled'
    check (fulfillment_status in ('unfulfilled','partially_fulfilled','fulfilled','partially_shipped','shipped','partially_delivered','delivered','partially_returned','returned')),
  -- money snapshots, integer cents
  subtotal_net int not null default 0,
  discount_total int not null default 0,
  shipping_net int not null default 0,
  shipping_gross int not null default 0,
  tax_total int not null default 0,
  grand_total int not null default 0,
  tax_country char(2),
  tax_breakdown jsonb not null default '[]',      -- [{rate, net, tax}]
  tax_treatment text not null default 'domestic'
    check (tax_treatment in ('domestic','eu_oss','export')),
  vat_id text,                                     -- B2B-ready (reverse charge later)
  reverse_charge boolean not null default false,
  shipping_address jsonb,                          -- snapshots, never FKs
  billing_address jsonb,
  checkout_id uuid references hw_checkouts(id) on delete set null,
  stripe_payment_intent_id text,
  sales_channel text not null default 'admin' check (sales_channel in ('web','admin','b2b')),
  risk_status text not null default 'ok' check (risk_status in ('ok','review','blocked')),
  notes text,
  metadata jsonb not null default '{}',
  placed_at timestamptz not null default now(),
  canceled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists hw_orders_status_idx on hw_orders (status, payment_status, fulfillment_status);
create index if not exists hw_orders_email_idx on hw_orders (email);
create index if not exists hw_orders_placed_idx on hw_orders (placed_at desc);

create table if not exists hw_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references hw_orders(id) on delete cascade,
  variant_id uuid references hw_variants(id) on delete set null,
  sku text not null,                               -- snapshot
  title text not null,                             -- snapshot: product name
  variant_title text,                              -- snapshot: variant name
  quantity int not null check (quantity > 0),
  unit_price_net int not null,                     -- cents
  unit_price_gross int not null,
  tax_rate numeric not null default 0,
  tax_amount int not null default 0,
  discount_amount int not null default 0,
  total_gross int not null default 0,
  quantity_fulfilled int not null default 0,
  quantity_shipped int not null default 0,
  quantity_delivered int not null default 0,
  quantity_returned int not null default 0,
  requires_shipping boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists hw_order_lines_order_idx on hw_order_lines (order_id);

-- Append-only money ledger: captures positive, refunds negative.
create table if not exists hw_order_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references hw_orders(id) on delete cascade,
  type text not null check (type in ('authorization','capture','refund')),
  amount int not null,                             -- signed cents
  currency char(3) not null default 'EUR',
  provider text not null default 'manual'
    check (provider in ('stripe','bank_transfer','gift_card','manual')),
  provider_ref text,
  reason text,
  order_line_refs jsonb,                           -- [{line_id, quantity}] for refunds
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists hw_order_tx_order_idx on hw_order_transactions (order_id);

-- Audit trail + outbox (emails/3PL consume events, never poll mutable state).
create table if not exists hw_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references hw_orders(id) on delete cascade,
  type text not null,
  actor text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists hw_order_events_order_idx on hw_order_events (order_id, created_at);

-- ── Fulfillments (order → n shipments) ───────────────────────────────────────
create table if not exists hw_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references hw_orders(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','shipped','delivered','canceled')),
  provider text not null default 'manual',         -- later: 3PL code
  location_id uuid references hw_stock_locations(id),
  carrier text,
  tracking_number text,
  tracking_url text,
  packed_at timestamptz not null default now(),
  shipped_at timestamptz,
  delivered_at timestamptz,
  notes text,
  provider_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists hw_fulfillments_order_idx on hw_fulfillments (order_id);

create table if not exists hw_fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references hw_fulfillments(id) on delete cascade,
  order_line_id uuid not null references hw_order_lines(id) on delete cascade,
  quantity int not null check (quantity > 0)
);

-- ── Reservations (oversell prevention is a DATABASE property) ────────────────
create table if not exists hw_reservations (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references hw_variants(id) on delete cascade,
  location_id uuid not null references hw_stock_locations(id),
  qty int not null check (qty > 0),
  order_line_id uuid references hw_order_lines(id) on delete cascade,
  checkout_id uuid references hw_checkouts(id) on delete cascade,
  expires_at timestamptz,                          -- TTL mode for later drops; null = held
  created_at timestamptz not null default now()
);
create index if not exists hw_reservations_variant_idx on hw_reservations (variant_id, location_id);

-- Atomic reserve: fails (returns null) instead of overselling.
create or replace function hw_reserve_stock(
  p_variant uuid, p_location uuid, p_qty int,
  p_order_line uuid default null, p_checkout uuid default null, p_expires timestamptz default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  update hw_stock_levels
     set reserved = reserved + p_qty, updated_at = now()
   where variant_id = p_variant and location_id = p_location
     and on_hand - reserved >= p_qty;
  if not found then return null; end if;
  insert into hw_reservations (variant_id, location_id, qty, order_line_id, checkout_id, expires_at)
  values (p_variant, p_location, p_qty, p_order_line, p_checkout, p_expires)
  returning id into v_id;
  return v_id;
end $$;

create or replace function hw_release_reservation(p_reservation uuid)
returns void language plpgsql as $$
declare r record;
begin
  select * into r from hw_reservations where id = p_reservation;
  if not found then return; end if;
  update hw_stock_levels
     set reserved = greatest(0, reserved - r.qty), updated_at = now()
   where variant_id = r.variant_id and location_id = r.location_id;
  delete from hw_reservations where id = p_reservation;
end $$;

-- ── Destination VAT (EU-27 standard rates; verify with the tax advisor) ──────
create table if not exists hw_tax_rates (
  country char(2) primary key,
  rate numeric not null,
  valid_from date not null default current_date,
  updated_at timestamptz not null default now()
);
insert into hw_tax_rates (country, rate) values
  ('AT',20),('BE',21),('BG',20),('HR',25),('CY',19),('CZ',21),('DE',19),('DK',25),
  ('EE',24),('ES',21),('FI',25.5),('FR',20),('GR',24),('HU',27),('IE',23),('IT',22),
  ('LT',21),('LU',17),('LV',21),('MT',18),('NL',21),('PL',23),('PT',23),('RO',21),
  ('SE',25),('SI',22),('SK',23)
on conflict (country) do nothing;

-- ── RLS: zero-policy enables (service role only, same as the whole hw_* set) ─
alter table hw_checkouts enable row level security;
alter table hw_orders enable row level security;
alter table hw_order_lines enable row level security;
alter table hw_order_transactions enable row level security;
alter table hw_order_events enable row level security;
alter table hw_fulfillments enable row level security;
alter table hw_fulfillment_lines enable row level security;
alter table hw_reservations enable row level security;
alter table hw_tax_rates enable row level security;
