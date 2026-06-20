-- Registration redesign: free signup creates a "registered" lead (no payment),
-- with GDPR marketing consent captured at signup. Additive + idempotent.
-- (The "registered" booking status is just a text value — no schema change.)
alter table contacts add column if not exists marketing_opt_in boolean not null default false;
