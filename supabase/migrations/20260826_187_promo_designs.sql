-- 186: Promo Studio — saved promo-graphic designs. One row per design; the
-- whole editable state (layers, per-format positions, texts) lives in `state`
-- so the editor can evolve without schema churn. Soft-delete via archived_at
-- per the house archive rule.
create table if not exists exp_promo_designs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled',
  format      text not null default '45',
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
alter table exp_promo_designs enable row level security;
create policy "promo designs team" on exp_promo_designs
  for all using (is_team_member()) with check (is_team_member());
