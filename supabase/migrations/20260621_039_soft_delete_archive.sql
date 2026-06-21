-- ============================================================
-- 20260621_039_soft_delete_archive.sql
--   Archive-before-delete: "Delete" now ARCHIVES (sets archived_at) instead of
--   destroying a row. Lists hide archived rows; the admin Archive page restores
--   them or — owner only — permanently deletes. Additive + idempotent.
-- ============================================================

alter table exp_experiences  add column if not exists archived_at timestamptz;
alter table exp_editions     add column if not exists archived_at timestamptz;
alter table exp_packages     add column if not exists archived_at timestamptz;
alter table exp_components    add column if not exists archived_at timestamptz;
alter table contacts         add column if not exists archived_at timestamptz;
alter table hotels           add column if not exists archived_at timestamptz;
alter table exp_hotel_rooms  add column if not exists archived_at timestamptz;
alter table vendors          add column if not exists archived_at timestamptz;
alter table hw_products      add column if not exists archived_at timestamptz;

-- Partial indexes keep the common "active" reads (archived_at IS NULL) fast.
create index if not exists idx_exp_experiences_active on exp_experiences (archived_at) where archived_at is null;
create index if not exists idx_exp_editions_active    on exp_editions (archived_at) where archived_at is null;
create index if not exists idx_exp_packages_active    on exp_packages (archived_at) where archived_at is null;
create index if not exists idx_exp_components_active   on exp_components (archived_at) where archived_at is null;
create index if not exists idx_contacts_active        on contacts (archived_at) where archived_at is null;
create index if not exists idx_hotels_active          on hotels (archived_at) where archived_at is null;
create index if not exists idx_exp_hotel_rooms_active on exp_hotel_rooms (archived_at) where archived_at is null;
create index if not exists idx_vendors_active         on vendors (archived_at) where archived_at is null;
create index if not exists idx_hw_products_active     on hw_products (archived_at) where archived_at is null;
