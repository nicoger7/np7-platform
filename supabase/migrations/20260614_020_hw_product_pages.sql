-- NP7 Hardware product pages (Phase 1): ERP/page fields on hw_products +
-- a per-product website-content table (hero, copy, gallery, Find-Your-Fit).
-- RLS mirrors exp_content (20260609_012): public select, team_member() write.
-- Idempotent: safe to re-run.

alter table hw_products
  add column if not exists template         text not null default 'board',
  add column if not exists subtitle         text,
  add column if not exists currency         text not null default 'EUR',
  add column if not exists compare_at_price  numeric,
  add column if not exists sku              text,
  add column if not exists cost             numeric,
  add column if not exists stock_count      integer;

create table if not exists hw_product_content (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null unique references hw_products(id) on delete cascade,
  hero_image     text,
  hero_video_url text,
  gallery        text[]  not null default '{}',
  tagline        text,
  overview       text,
  highlights     jsonb   not null default '[]'::jsonb,   -- ["feature bullet", ...]
  spec_rows      jsonb   not null default '[]'::jsonb,   -- [{ "label": "...", "value": "..." }, ...]
  find_your_fit  jsonb   not null default '[]'::jsonb,   -- [{ id, chip, tag, title, body, points[], cta, cta_href, icon, image }, ...]
  updated_at     timestamptz not null default now()
);
create index if not exists idx_hw_product_content_product on hw_product_content(product_id);

alter table hw_products        enable row level security;
alter table hw_product_content enable row level security;

drop policy if exists "hw_products public read" on hw_products;
create policy "hw_products public read" on hw_products for select using (true);
drop policy if exists "hw_products team write" on hw_products;
create policy "hw_products team write" on hw_products for all using (is_team_member()) with check (is_team_member());

drop policy if exists "hw_product_content public read" on hw_product_content;
create policy "hw_product_content public read" on hw_product_content for select using (true);
drop policy if exists "hw_product_content team write" on hw_product_content;
create policy "hw_product_content team write" on hw_product_content for all using (is_team_member()) with check (is_team_member());
