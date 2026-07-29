-- Migration 121: GTIN/EAN allocation from NP7's own GS1 company prefix.
-- EANs cannot be invented: every legitimate GTIN derives from a prefix
-- licensed to the company (retailers verify ownership via GS1's GEPIR
-- registry). This stores the prefix and an append-only ledger of every
-- number ever issued, so a retired GTIN is never handed out twice.

-- The GS1 company prefix, per division (hardware). Length varies with the
-- package size — a small package means a LONGER prefix and fewer item
-- references, so capacity is derived from the prefix, never assumed.
alter table company_settings add column if not exists gs1_prefix text;

create table if not exists hw_gtin_allocations (
  id uuid primary key default gen_random_uuid(),
  gtin text not null unique,               -- full EAN-13 incl. check digit
  item_reference text not null unique,     -- the sequential part inside our prefix
  prefix text not null,                    -- prefix used (kept for history if it ever changes)
  variant_id uuid references hw_variants(id) on delete set null,
  allocated_at timestamptz not null default now(),
  allocated_by text,
  retired_at timestamptz,                  -- product discontinued; number still never reused
  notes text
);
create index if not exists hw_gtin_variant_idx on hw_gtin_allocations (variant_id);

alter table hw_gtin_allocations enable row level security;
