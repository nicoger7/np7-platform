-- Infrastructure crowd-confirm: members tick the on-site facilities they found
-- (from the fixed vocab in spotguide.ts INFRASTRUCTURE_TAGS), stored per member
-- on their spot_ratings row and aggregated exactly like `conditions` — the more
-- riders report a facility, the higher its confirm count.
--
-- Additive + tolerant: code selects spot_ratings with "*" and reads
-- `infrastructure` optionally, so it works before this is applied (empty tally).
-- Manual migration — paste in the Supabase SQL editor.

alter table spot_ratings
  add column if not exists infrastructure text[] not null default '{}';
