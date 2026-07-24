-- 115: the live analytics_events table was created from an EARLIER version of
-- migration 038 and never got `country` / `authed`, which were added to that
-- file later. Both the ingest INSERT and the admin SELECT reference them, so
-- every tracking write failed silently (error swallowed) and the dashboard
-- showed "tracking isn't live yet". Applied live via the Management API.
alter table analytics_events
  add column if not exists country text,
  add column if not exists authed boolean not null default false;
