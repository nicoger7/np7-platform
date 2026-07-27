-- Migration 116: Hardware supply-chain foundation (blueprint Phase 1)
-- Catalog variants + serials, suppliers + supplier catalog, purchase orders
-- (status ladder, factory payments, milestones, QC gates), inbound shipments
-- with landed-cost worksheet, and the stock ledger (locations / immutable
-- movements / derived levels + atomic RPC).
-- See docs/hardware-backend-blueprint.md. Additive-only; RLS zero-policy
-- (service role only — same pattern as migration 087).

-- ── Catalog: variants ────────────────────────────────────────────────────────

create table if not exists hw_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references hw_products(id) on delete cascade,
  sku text not null unique,
  ean text,
  name text not null,                       -- variant label, e.g. "115L" / "7.8"
  attributes jsonb not null default '{}',   -- numeric specs: volume_l, length_cm, sail_m2…
  weight_g int,                             -- BOXED weight (shipping + freight allocation)
  box_l_mm int, box_w_mm int, box_h_mm int, -- boxed carton dims
  hs_code text,                             -- e.g. 9506 21 00 sailboards
  customs_description text,
  country_of_origin text,
  preferential_origin boolean not null default false,
  customs_value numeric,
  serialized boolean not null default false,
  rrp numeric,
  lifecycle text not null default 'active'
    check (lifecycle in ('draft','active','phase_out','discontinued')),
  sort_order int not null default 0,
  packaging_weights jsonb,                  -- {cardboard_g, plastic_g, foam_g} for EPR reports
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists hw_variants_product_idx on hw_variants (product_id);

-- ── Catalog: serials (boards + masts) ────────────────────────────────────────

create table if not exists hw_serials (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references hw_variants(id) on delete cascade,
  serial_no text not null unique,
  current_location_id uuid,
  current_state text not null default 'in_stock'
    check (current_state in ('produced','in_stock','sold','demo','warranty_replaced','scrapped')),
  sold_order_ref text,
  sold_at timestamptz,
  warranty_until date,
  registered_owner_contact_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hw_serials_variant_idx on hw_serials (variant_id);

create table if not exists hw_serial_events (
  id uuid primary key default gen_random_uuid(),
  serial_id uuid not null references hw_serials(id) on delete cascade,
  type text not null,                       -- produced|received|sold|registered|claimed|replaced|returned
  ref text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists hw_serial_events_serial_idx on hw_serial_events (serial_id);

-- ── Suppliers ────────────────────────────────────────────────────────────────

create table if not exists hw_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  currency text not null default 'USD',
  default_incoterm text,                    -- FOB / EXW / DAP …
  default_payment_terms text,               -- e.g. "30/70 T/T"
  contact_name text, contact_email text, contact_phone text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Per-variant supplier catalog: cost, MOQ, lead time — what replenishment reads.
create table if not exists hw_supplier_skus (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references hw_suppliers(id) on delete cascade,
  variant_id uuid not null references hw_variants(id) on delete cascade,
  supplier_item_code text,
  unit_cost numeric,
  currency text not null default 'USD',
  moq int,
  order_multiple int not null default 1,
  lead_time_days int,
  incoterm text,
  preferential_origin boolean not null default false,  -- e.g. EVFTA 0% duty
  valid_from date, valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hw_supplier_skus_supplier_idx on hw_supplier_skus (supplier_id);
create index if not exists hw_supplier_skus_variant_idx on hw_supplier_skus (variant_id);

-- ── Purchase orders ──────────────────────────────────────────────────────────

create sequence if not exists hw_po_number_seq;

create table if not exists hw_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique
    default ('PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('hw_po_number_seq')::text, 3, '0')),
  supplier_id uuid not null references hw_suppliers(id),
  status text not null default 'draft'
    check (status in ('draft','issued','confirmed','in_production','ready_to_ship',
                      'shipped','partially_received','received','closed','cancelled')),
  currency text not null default 'USD',
  incoterm text,
  order_date date,
  ex_factory_planned date,
  ex_factory_actual date,
  expected_receipt_date date,
  payment_terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists hw_pos_supplier_idx on hw_purchase_orders (supplier_id);

create table if not exists hw_po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references hw_purchase_orders(id) on delete cascade,
  variant_id uuid not null references hw_variants(id),
  supplier_sku_id uuid references hw_supplier_skus(id),
  qty_ordered int not null check (qty_ordered > 0),
  unit_cost numeric,
  qty_shipped int not null default 0,
  qty_received int not null default 0,
  qty_rejected int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists hw_po_lines_po_idx on hw_po_lines (po_id);
create index if not exists hw_po_lines_variant_idx on hw_po_lines (variant_id);

-- Immutable status audit → per-supplier lead-time analytics come from here.
create table if not exists hw_po_status_events (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references hw_purchase_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists hw_po_status_events_po_idx on hw_po_status_events (po_id);

-- Factory payments (30/70 T/T deposits/balances) — prepayments, FX per payment.
create table if not exists hw_po_payments (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references hw_purchase_orders(id) on delete cascade,
  kind text not null check (kind in ('deposit','balance','other')),
  planned_amount numeric,
  planned_date date,
  paid_amount numeric,
  paid_date date,
  fx_rate numeric,                          -- supplier currency → EUR at payment
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hw_po_payments_po_idx on hw_po_payments (po_id);

create table if not exists hw_po_milestones (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references hw_purchase_orders(id) on delete cascade,
  kind text not null,                       -- materials_ordered|production_start|sample_approved|
                                            -- production_complete|inspection_passed|booked_freight|custom
  label text,
  planned_date date,
  actual_date date,
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists hw_po_milestones_po_idx on hw_po_milestones (po_id);

-- QC inspections — a blocking PSI gates the balance payment.
create table if not exists hw_qc_inspections (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references hw_purchase_orders(id) on delete cascade,
  type text not null check (type in ('FAI','IPC','DUPRO','PSI','CLS')),
  inspector text,                           -- self|factory|third_party
  agency text,
  date date,
  aql_level text,
  sample_size int,
  defects jsonb,
  result text check (result in ('pass','fail','pass_with_notes')),
  report_url text,
  blocks_balance_payment boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hw_qc_po_idx on hw_qc_inspections (po_id);

-- ── Inbound shipments + landed cost ──────────────────────────────────────────

create table if not exists hw_inbound_shipments (
  id uuid primary key default gen_random_uuid(),
  reference text not null,                  -- forwarder ref / container booking
  mode text not null default 'sea' check (mode in ('sea','air','rail','road')),
  incoterm text,
  container_no text,
  carrier text,
  forwarder text,
  etd date, eta date, ata date,
  customs_cleared_at date,
  status text not null default 'booked'
    check (status in ('booked','in_transit','at_port','cleared','received','closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Many-to-many: one PO can arrive in two containers; one container carries 3 POs.
create table if not exists hw_inbound_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references hw_inbound_shipments(id) on delete cascade,
  po_line_id uuid not null references hw_po_lines(id),
  qty int not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index if not exists hw_inbound_lines_shipment_idx on hw_inbound_lines (shipment_id);
create index if not exists hw_inbound_lines_po_line_idx on hw_inbound_lines (po_line_id);

-- Landed-cost worksheet rows. Import VAT (EUSt) deliberately NOT a kind — it's
-- deductible input tax, never landed cost.
create table if not exists hw_shipment_costs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references hw_inbound_shipments(id) on delete cascade,
  kind text not null check (kind in ('freight','duty','insurance','brokerage','handling','demurrage','other')),
  amount numeric not null,                  -- in EUR (converted via fx_rate if invoiced otherwise)
  currency text not null default 'EUR',
  fx_rate numeric not null default 1,
  is_estimate boolean not null default true,
  invoice_ref text,
  allocation_basis text not null default 'value'
    check (allocation_basis in ('value','weight','volume','qty')),
  created_at timestamptz not null default now()
);
create index if not exists hw_shipment_costs_shipment_idx on hw_shipment_costs (shipment_id);

-- Receipts double as cost layers: qty received at a landed unit cost.
create table if not exists hw_receipts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references hw_inbound_shipments(id),
  po_line_id uuid not null references hw_po_lines(id),
  variant_id uuid not null references hw_variants(id),
  qty int not null check (qty > 0),
  unit_landed_cost numeric,                 -- EUR: unit cost×fx + allocated shipment costs
  location_id uuid,                         -- where it was received into
  received_at timestamptz not null default now(),
  notes text
);
create index if not exists hw_receipts_po_line_idx on hw_receipts (po_line_id);
create index if not exists hw_receipts_variant_idx on hw_receipts (variant_id);

-- ── Stock ledger ─────────────────────────────────────────────────────────────

create table if not exists hw_stock_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('supplier','in_transit','3pl','own_storage','demo','customer','inventory_loss')),
  is_virtual boolean not null default false,
  created_at timestamptz not null default now()
);

-- Immutable double-entry movements (Odoo-style). Corrections are reversing
-- movements, never UPDATEs. Sum over all locations per variant = 0.
create table if not exists hw_stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references hw_variants(id),
  from_location_id uuid not null references hw_stock_locations(id),
  to_location_id uuid not null references hw_stock_locations(id),
  qty int not null check (qty > 0),
  reason text not null
    check (reason in ('po_receipt','in_transit','transfer','sale','return','adjustment',
                      'demo_out','demo_return','warranty_replacement','write_off','b2b_shipment','correction')),
  ref_type text,
  ref_id uuid,
  serial_id uuid references hw_serials(id),
  unit_cost numeric,                        -- landed EUR cost at move time (COGS trail)
  note text,
  actor text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists hw_moves_variant_idx on hw_stock_movements (variant_id, occurred_at desc);
create index if not exists hw_moves_ref_idx on hw_stock_movements (ref_type, ref_id);

-- Derived cache of the ledger (reconciled against it; never edited directly
-- outside hw_record_movement).
create table if not exists hw_stock_levels (
  variant_id uuid not null references hw_variants(id),
  location_id uuid not null references hw_stock_locations(id),
  on_hand int not null default 0,
  reserved int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (variant_id, location_id)
);

-- Atomic movement writer: ledger row + both level rows in one transaction.
create or replace function hw_record_movement(
  p_variant uuid, p_from uuid, p_to uuid, p_qty int, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null,
  p_serial uuid default null, p_unit_cost numeric default null,
  p_note text default null, p_actor text default null,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'movement qty must be positive';
  end if;
  if p_from = p_to then
    raise exception 'movement source and target must differ';
  end if;
  insert into hw_stock_movements
    (variant_id, from_location_id, to_location_id, qty, reason, ref_type, ref_id,
     serial_id, unit_cost, note, actor, occurred_at)
  values (p_variant, p_from, p_to, p_qty, p_reason, p_ref_type, p_ref_id,
          p_serial, p_unit_cost, p_note, p_actor, coalesce(p_occurred_at, now()))
  returning id into v_id;
  insert into hw_stock_levels (variant_id, location_id, on_hand)
    values (p_variant, p_from, -p_qty)
    on conflict (variant_id, location_id)
    do update set on_hand = hw_stock_levels.on_hand - p_qty, updated_at = now();
  insert into hw_stock_levels (variant_id, location_id, on_hand)
    values (p_variant, p_to, p_qty)
    on conflict (variant_id, location_id)
    do update set on_hand = hw_stock_levels.on_hand + p_qty, updated_at = now();
  return v_id;
end $$;

revoke all on function hw_record_movement(uuid, uuid, uuid, int, text, text, uuid, uuid, numeric, text, text, timestamptz) from public;
grant execute on function hw_record_movement(uuid, uuid, uuid, int, text, text, uuid, uuid, numeric, text, text, timestamptz) to service_role;

-- Seed the standard locations (3PL location added once the fulfiller is chosen).
insert into hw_stock_locations (code, name, kind, is_virtual) values
  ('SUPPLIER',  'Suppliers (virtual)',      'supplier',       true),
  ('TRANSIT',   'In transit',               'in_transit',     false),
  ('HQ',        'Own storage',              'own_storage',    false),
  ('DEMO',      'Demo / team riders',       'demo',           false),
  ('CUSTOMER',  'Customers (virtual)',      'customer',       true),
  ('LOSS',      'Inventory loss (virtual)', 'inventory_loss', true)
on conflict (code) do nothing;

-- ── RLS: zero-policy enables (service role only, like migration 087) ─────────

alter table hw_variants           enable row level security;
alter table hw_serials            enable row level security;
alter table hw_serial_events      enable row level security;
alter table hw_suppliers          enable row level security;
alter table hw_supplier_skus      enable row level security;
alter table hw_purchase_orders    enable row level security;
alter table hw_po_lines           enable row level security;
alter table hw_po_status_events   enable row level security;
alter table hw_po_payments        enable row level security;
alter table hw_po_milestones      enable row level security;
alter table hw_qc_inspections     enable row level security;
alter table hw_inbound_shipments  enable row level security;
alter table hw_inbound_lines      enable row level security;
alter table hw_shipment_costs     enable row level security;
alter table hw_receipts           enable row level security;
alter table hw_stock_locations    enable row level security;
alter table hw_stock_movements    enable row level security;
alter table hw_stock_levels       enable row level security;
