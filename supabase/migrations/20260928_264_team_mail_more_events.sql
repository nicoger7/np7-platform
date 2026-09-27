-- 264 · The team hears about every sign-up and every order
--
-- Nico, 27 Sep 2026: Simona and experience@ should get an email for every
-- sign-up and every order. The code now registers these events
-- (src/lib/email/team-alerts.ts, TEAM_EVENTS) with their sweeps in
-- team-alerts-guests.ts; this gives each one the two recipients Nico named.
--
--   payment_received        a Stripe payment or a gift voucher used on a booking
--   transfer_failed         Stripe reports a bank payment failed or fell short
--   guest_request           "Any other requests?" from the trip page
--   cancellation_requested  a guest pressed Cancel this trip
--   widerruf_received       a § 356a withdrawal through /widerruf
--   account_signup          an account with no booking, 15 minutes on
--   signature_application   a confirmed Signature Trip application
--   review_submitted        a guest wrote or changed a review
--
-- NOT seeded on purpose: hw_order_placed, hw_return_requested, hw_enquiry. The
-- shop is hidden until launch and Nico has not said who gets those; they stay
-- empty until someone is added in Admin → Emails → Team.
--
-- Data only. No schema change: team_mail_recipients (migration 254) already
-- holds any event key the code registers. Anyone here can be switched off or
-- swapped in Admin → Emails → Team, and a rerun changes nothing.

insert into team_mail_recipients (event_key, email, name)
select e.event_key, r.email, r.name
from (values
  ('payment_received'),
  ('transfer_failed'),
  ('guest_request'),
  ('cancellation_requested'),
  ('widerruf_received'),
  ('account_signup'),
  ('signature_application'),
  ('review_submitted')
) as e(event_key)
cross join (values
  ('simona@np-seven.com', 'Simona Alessandrí'),
  ('experience@np-seven.com', 'Experience inbox')
) as r(email, name)
on conflict do nothing;
