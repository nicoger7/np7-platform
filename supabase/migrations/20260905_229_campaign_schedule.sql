-- A campaign can be set to go out later.
--
-- Until now sending was a person holding a button: the admin opened a campaign
-- and the UI looped sendCampaignChunk until it was done. That is fine for 68
-- recipients on a Tuesday afternoon and useless for "Sunday 09:00", which is
-- when people actually read a newsletter.
--
-- The claim pattern here is lifted from the NP7 Windsurfing publisher, which
-- has been running scheduled social posts for months. Two things it learned the
-- hard way and this inherits:
--
--   The status CHECK must know every value the code writes. Over there a check
--   constraint that had never heard of a new status made the transition fail
--   SILENTLY, the row stayed claimed, and the stale-restart re-fired it 57
--   times for a single post. So 'scheduled' goes in the constraint here, in the
--   same migration as the column, and the code verifies its own writes.
--
--   updated_at doubles as a heartbeat, so a run that dies halfway can be
--   reclaimed rather than wedging the campaign forever.

alter table public.email_campaigns
  drop constraint if exists email_campaigns_status_check;

alter table public.email_campaigns
  add constraint email_campaigns_status_check
  check (status = any (array['draft','scheduled','sending','sent','canceled']));

alter table public.email_campaigns
  add column if not exists scheduled_at timestamptz;

comment on column public.email_campaigns.scheduled_at is
  'UTC instant this campaign should start sending. Only meaningful while status = scheduled.';

-- The cron asks one question every hour: is anything due? A partial index means
-- that question never scans campaigns that are drafts, sent, or in flight.
create index if not exists email_campaigns_due_idx
  on public.email_campaigns (scheduled_at)
  where status = 'scheduled';
