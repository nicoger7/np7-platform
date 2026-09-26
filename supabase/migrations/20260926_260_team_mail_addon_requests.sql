-- 260 · The team hears about add-on requests too
--
-- A guest can ask for an extra night, a lesson or a transfer from their trip
-- page. The row landed as `requested` and waited, unannounced, until somebody
-- happened to open that booking (Nico, 26 Sep 2026: "did you build out the
-- team-mails for bookings or requested add-ons?").
--
-- The event and its sweep live in code (src/lib/email/team-alerts.ts); this
-- only subscribes the same two addresses that already hear about new bookings,
-- so the request arrives where the booking did. Either can be switched off in
-- Admin → Emails → Team.
--
-- Data only. No schema change: team_mail_recipients (migration 254) already
-- holds any event key the code registers.

insert into team_mail_recipients (event_key, email, name)
values
  ('addon_requested', 'simona@np-seven.com', 'Simona Alessandrí'),
  ('addon_requested', 'experience@np-seven.com', 'Experience inbox')
on conflict do nothing;
