-- 086 · Email campaigns (blast mail to targeted audiences)
--
-- ONE new table: the campaign itself. Per-recipient sends are logged in the
-- existing email_log with dedupe_key = 'camp:<campaign_id>:<contact_id>' —
-- the unique index on dedupe_key gives idempotency (no double sends), crash
-- resumability, and visibility in the Email Log page for free.
--
-- audience jsonb = the saved filter, e.g.
--   {"segment":"newsletter","tags":["Clinic"],"locations":["NP7 Experience Bonaire"],"countries":[]}
-- Recipients are ALWAYS additionally restricted at send time to
-- marketing_opt_in = true, email present, not archived.

create table if not exists email_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  subject          text,
  preheader        text,
  body             text,                          -- html body (brand frame added at send)
  division         text not null default 'experience' check (division in ('experience','hardware')),
  header_image     text,
  header_position  int,
  audience         jsonb not null default '{}',
  status           text not null default 'draft' check (status in ('draft','sending','sent')),
  recipient_count  int,
  sent_count       int not null default 0,
  failed_count     int not null default 0,
  test_sent_at     timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

comment on table email_campaigns is
  'Marketing blast campaigns. Sends log to email_log (dedupe_key camp:<id>:<contact_id>); only marketing_opt_in contacts ever receive them.';
