-- Per-product fin-selector tuning (the admin "builder"): overrides the default
-- race-carbon rule in src/lib/hardware/fin-selector.ts for other fin models.
alter table public.hw_products add column if not exists selector_tuning jsonb;
