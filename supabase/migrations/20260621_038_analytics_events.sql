-- ============================================================
-- 20260621_038_analytics_events.sql
--   First-party, privacy-first behaviour analytics. One row per tracked event
--   (pageview + key conversions). NO IP, NO third-party cookies, NO PII — the
--   client only ever sends data after the visitor accepts analytics in the
--   cookie banner (np7_consent = "all"). Ids are random first-party tokens.
--
--   Ingest is via the service-role /api/track endpoint (bypasses RLS). The admin
--   dashboard reads via service role too. RLS just blocks the anon/public client.
-- ============================================================

create table if not exists analytics_events (
  id              bigint generated always as identity primary key,
  ts              timestamptz not null default now(),
  session_id      text not null,                 -- per-tab session (random, consented)
  visitor_id      text,                          -- stable-ish first-party id (random, consented)
  event           text not null,                 -- 'pageview' | 'reserve_start' | 'register' | 'voucher_buy' | ...
  path            text,                          -- pathname only (no query string with PII)
  referrer_host   text,                          -- referrer hostname only
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  device          text,                          -- 'mobile' | 'tablet' | 'desktop'
  experience_slug text,                          -- funnel context when on an experience page
  country         text,                          -- coarse geo (Vercel edge header) — NO IP stored
  authed          boolean not null default false, -- was the visitor signed in? (member vs guest; NO identity)
  meta            jsonb not null default '{}'::jsonb
);

create index if not exists idx_analytics_events_ts      on analytics_events (ts);
create index if not exists idx_analytics_events_event   on analytics_events (event);
create index if not exists idx_analytics_events_session on analytics_events (session_id);

alter table analytics_events enable row level security;

-- Team can read; nobody reads/writes via the anon client. Inserts come through
-- the service-role ingest API.
drop policy if exists "analytics_events team read" on analytics_events;
create policy "analytics_events team read" on analytics_events for select using (is_team_member());
