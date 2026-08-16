-- ============================================================================
-- 167 — The `verified` column migration 079 defined but never created.
--
-- 079 declares `verified boolean not null default false` inside a
-- `create table if not exists`. The table already existed from an earlier run
-- of that file, so the guard did its job and skipped the whole statement —
-- column included. Re-running 079 could never fix it.
--
-- Without the column every submission failed with "Could not find the
-- 'verified' column of 'exp_trip_applications' in the schema cache", so the
-- Signature Trips application form could not accept a single application.
--
-- Additive and safe: the table is empty, so there is nothing to backfill and
-- no existing application can be hidden by the admin list's verified=true
-- filter.
-- ============================================================================

alter table exp_trip_applications
  add column if not exists verified boolean not null default false;

comment on column exp_trip_applications.verified is
  'Double opt-in. A guest applies unverified and clicks a magic link to make it real; a logged-in member is verified on submit. The admin list shows verified rows only.';

create index if not exists idx_trip_applications_verified
  on exp_trip_applications (verified) where archived_at is null;
