-- Resend webhook events land here: first-open timestamp + the latest
-- delivery event per email (delivered / opened / bounced / complained).
alter table email_log
  add column if not exists opened_at timestamptz,
  add column if not exists last_event text;
