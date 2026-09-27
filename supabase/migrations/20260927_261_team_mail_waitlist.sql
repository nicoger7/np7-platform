-- 261 · The team hears about waiting-list sign-ups
--
-- A week with no packages on sale yet offers "tell me when this goes live",
-- which files a package-less lead. Those rows were announced as "New booking",
-- which they are not. They now have their own event, interest_signup, with its
-- sweep in code (src/lib/email/team-alerts.ts), and Nico chose who hears about
-- them (27 Sep 2026: "yes simona and me for now").
--
-- Data only. No schema change: team_mail_recipients (migration 254) already
-- holds any event key the code registers. Either address can be switched off
-- or swapped in Admin → Emails → Team.

insert into team_mail_recipients (event_key, email, name)
values
  ('interest_signup', 'simona@np-seven.com', 'Simona Alessandrí'),
  ('interest_signup', 'nico@np-seven.com', 'Nico Prien')
on conflict do nothing;
