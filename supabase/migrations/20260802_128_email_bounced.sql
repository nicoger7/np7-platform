-- A dead address should be visible on the person, not only in a log row.
--
-- Delivery events already land in email_log.last_event, but nothing surfaced
-- them on the contact — so a bounced address kept being mailed and nobody
-- found out. One bounce in the Lake Garda survey went unnoticed until it was
-- asked about directly.
alter table contacts
  add column if not exists email_bounced_at timestamptz,
  add column if not exists email_bounce_reason text;

comment on column contacts.email_bounced_at is
  'Last hard bounce/complaint for this address, set by the Resend webhook. Non-null = stop mailing until the address is corrected.';

create index if not exists contacts_email_bounced_idx
  on contacts (email_bounced_at) where email_bounced_at is not null;
