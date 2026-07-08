-- Migration 073: widen the exp_packages status CHECK to match the admin form
-- ─────────────────────────────────────────────────────────────────────────
-- The admin Status select offers active/draft/sold_out/archived, but the old
-- CHECK only allowed a subset (probed 2026-07-09: 'draft' and 'sold_out' were
-- rejected). This broke saving those statuses AND package duplication (copies
-- arrive as drafts so they never go live unreviewed). Idempotent.

alter table exp_packages
  drop constraint if exists exp_packages_status_check;

alter table exp_packages
  add constraint exp_packages_status_check
  check (status in ('active', 'draft', 'sold_out', 'archived'));

comment on constraint exp_packages_status_check on exp_packages is
  'Allowed package statuses — keep in sync with the admin Packages form (active/draft/sold_out/archived). Only ''active'' shows on the public website.';
