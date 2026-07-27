-- Migration 117: upgrade the pre-existing minimal hw_variants (label +
-- stock_count/reserved_count, 0 rows) to the blueprint catalog shape.
-- Migration 116's `create table if not exists hw_variants` was skipped because
-- the table already existed — this brings it to the intended schema.
-- stock_count/reserved_count are DROPPED: quantities live in the stock ledger
-- (hw_stock_movements → hw_stock_levels), never as mutable columns (blueprint §3.3).

alter table hw_variants rename column label to name;
alter table hw_variants alter column name set default '';
update hw_variants set name = '' where name is null;
alter table hw_variants alter column name set not null;

alter table hw_variants drop column if exists stock_count;
alter table hw_variants drop column if exists reserved_count;

alter table hw_variants
  add column if not exists sku text,
  add column if not exists ean text,
  add column if not exists attributes jsonb not null default '{}',
  add column if not exists weight_g int,
  add column if not exists box_l_mm int,
  add column if not exists box_w_mm int,
  add column if not exists box_h_mm int,
  add column if not exists hs_code text,
  add column if not exists customs_description text,
  add column if not exists country_of_origin text,
  add column if not exists preferential_origin boolean not null default false,
  add column if not exists customs_value numeric,
  add column if not exists serialized boolean not null default false,
  add column if not exists rrp numeric,
  add column if not exists lifecycle text not null default 'active',
  add column if not exists sort_order int not null default 0,
  add column if not exists packaging_weights jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

-- Table is empty → safe to enforce.
alter table hw_variants alter column sku set not null;
create unique index if not exists hw_variants_sku_key on hw_variants (sku);
alter table hw_variants add constraint hw_variants_lifecycle_check
  check (lifecycle in ('draft','active','phase_out','discontinued'));
