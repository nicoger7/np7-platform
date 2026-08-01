-- A held mail is a task, not a lost one.
--
-- The readiness guard stops a mail whose required content is missing, which
-- avoids sending a hollow "here's how to get ready" with no packing list. But
-- the cron's windows are bounded on BOTH sides — pre_trip_info only fires while
-- `daysToStart <= 21 && > 12` — so filling the content in on day 10 means the
-- mail never sends at all. One silent failure traded for another.
--
-- This table is the missing memory: it records what was held and why, so the
-- edition panel can show it and an admin can deliberately send it late.
create table if not exists mail_holds (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  booking_id uuid not null references exp_bookings(id) on delete cascade,
  edition_id uuid references exp_editions(id) on delete cascade,
  -- the dedupe key the cron would have used, so a later manual send stays
  -- idempotent against the normal pipeline
  dedupe_key text not null,
  missing text[] not null default '{}',
  first_held_at timestamptz not null default now(),
  last_held_at timestamptz not null default now(),
  -- exactly one of these ends a hold's life
  sent_at timestamptz,      -- an admin chose to send it late
  resolved_at timestamptz,  -- it went out through the normal window after all
  expired_at timestamptz,   -- the trip started; sending now would be noise
  constraint mail_holds_unique_per_booking unique (template_key, booking_id)
);

create index if not exists mail_holds_edition_open_idx
  on mail_holds (edition_id)
  where sent_at is null and resolved_at is null and expired_at is null;

comment on table mail_holds is
  'Mails the cron held back for missing content. Open rows are actionable: fill the content, then send late on purpose.';
