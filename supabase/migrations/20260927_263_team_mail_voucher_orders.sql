-- 263 · The team hears about gift-voucher orders
--
-- A voucher ordered on the website sat as a 'pending' row until somebody
-- happened to open Admin → Vouchers. Nobody was told, and the buyer got no
-- mail either, so a transfer could land with nobody expecting it (Nico,
-- 27 Sep 2026). The route now mails the buyer the bank details and tells the
-- team, under its own event, voucher_ordered (src/lib/email/team-alerts.ts).
--
-- Data only. No schema change: team_mail_recipients (migration 254) already
-- holds any event key the code registers. Either address can be switched off
-- or swapped in Admin → Emails → Team.

insert into team_mail_recipients (event_key, email, name)
values
  ('voucher_ordered', 'simona@np-seven.com', 'Simona Alessandrí'),
  ('voucher_ordered', 'experience@np-seven.com', 'Experience inbox')
on conflict do nothing;
