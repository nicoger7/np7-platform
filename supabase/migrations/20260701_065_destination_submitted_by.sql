-- Migration 065: members can propose a new destination (area)
-- ─────────────────────────────────────────────────────────────────────────
-- When a member adds a spot far from any existing destination, they name a new
-- area — that creates a destination in a pending state (spotguide_status='draft'
-- + submitted_by set) that NP7 reviews & publishes. Additive + idempotent.

alter table destinations
  add column if not exists submitted_by uuid references contacts(id) on delete set null;
