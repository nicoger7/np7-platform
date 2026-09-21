-- 254 · Who at NP7 hears about it
--
-- Every mail this platform sends goes to a guest. Nobody here is told anything:
-- a booking lands, an invoice settles, and the only way to find out is to open
-- the admin and look (Nico, 21 Sep 2026: "team would be nice if it lists (and
-- can adjust, switch off or on) the emails our team gets. Non so far. but
-- simona and experience@np-seven.com should receive for now at least every new
-- booking").
--
-- One row per (event, address). Not per team member, because the first two
-- recipients are a person and a shared inbox, and a shared inbox has no row in
-- team_members and never will. The name is carried alongside so the admin can
-- show "Simona" rather than an address, and so an address whose person leaves
-- does not become anonymous.
--
-- `enabled` rather than deleting: switching Simona off for a fortnight and back
-- on is the normal case, and a deleted row loses who it was.

create table if not exists team_mail_recipients (
  id          uuid primary key default gen_random_uuid(),
  event_key   text not null,
  email       text not null,
  name        text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One subscription per address per event, case-insensitively: the admin
-- toggles `enabled` rather than adding a second row. An expression like
-- lower(email) cannot live in a table-level UNIQUE constraint, so it is an
-- index.
create unique index if not exists team_mail_recipients_unique
  on team_mail_recipients (event_key, lower(email));

comment on table team_mail_recipients is
  'Internal notifications: which NP7 address hears about which event. Managed in Admin → Emails → Team. Not guest mail; these never go to a customer.';
comment on column team_mail_recipients.event_key is
  'The internal event, e.g. booking_created. The registry of valid keys lives in src/lib/email/team-alerts.ts, deliberately in code so an event nobody sends can never be subscribed to.';

create index if not exists team_mail_recipients_event_idx
  on team_mail_recipients (event_key) where enabled;

alter table team_mail_recipients enable row level security;

-- Service role only. This is staff configuration: no guest, signed in or not,
-- has any business reading or writing it, and every admin screen that touches
-- it goes through the service key.
drop policy if exists team_mail_recipients_service on team_mail_recipients;
create policy team_mail_recipients_service on team_mail_recipients
  for all to service_role using (true) with check (true);

-- The two Nico named, on from the start.
insert into team_mail_recipients (event_key, email, name)
values
  ('booking_created', 'simona@np-seven.com', 'Simona Alessandrí'),
  ('booking_created', 'experience@np-seven.com', 'Experience inbox')
on conflict do nothing;
