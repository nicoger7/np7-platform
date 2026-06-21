-- ============================================================
-- 20260621_033_waiver_signature_columns.sql
--   Corrective: the live exp_waiver_signatures table was created from an early
--   draft of migration 031, and `create table if not exists` never back-filled
--   the columns added to 031 later. This ALTERs the existing table so it matches
--   031 — unblocks member waiver signing (it failed: "Could not find the
--   'experience_id' / 'signed_name' column … in the schema cache").
--   Additive + idempotent.
-- ============================================================

alter table exp_waiver_signatures add column if not exists experience_id   uuid references exp_experiences(id) on delete set null;
alter table exp_waiver_signatures add column if not exists version          int  not null default 1;
alter table exp_waiver_signatures add column if not exists signed_name      text;
alter table exp_waiver_signatures add column if not exists signature_image  text;  -- data URL (PNG) of the drawn signature
alter table exp_waiver_signatures add column if not exists ip               text;
alter table exp_waiver_signatures add column if not exists user_agent       text;
alter table exp_waiver_signatures add column if not exists created_at       timestamptz not null default now();
