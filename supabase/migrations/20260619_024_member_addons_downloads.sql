-- 20260619_024_member_addons_downloads.sql
-- Additive-only (see NOTION-SUPABASE-SYNC.md). Two member-area features:
--   1. Cap on "download all photos" (3x per booking).
--   2. Member-requestable add-ons: members request an addon_available component,
--      the team confirms it. Reuses exp_booking_addons with a status + source.
-- Safe to run multiple times.

-- ── 1. Photo-download cap ───────────────────────────────────
alter table exp_bookings add column if not exists memory_download_count int not null default 0;

-- ── 2. Add-on request/confirm flow ──────────────────────────
-- status: 'requested' (member asked) | 'confirmed' (team approved — counts toward balance)
-- source: 'admin' (we added it) | 'member' (requested in My Trip)
-- Existing admin-added rows default to confirmed/admin so nothing changes for them.
alter table exp_booking_addons add column if not exists status       text not null default 'confirmed';
alter table exp_booking_addons add column if not exists source       text not null default 'admin';
alter table exp_booking_addons add column if not exists requested_at timestamptz;
alter table exp_booking_addons add column if not exists confirmed_at timestamptz;
