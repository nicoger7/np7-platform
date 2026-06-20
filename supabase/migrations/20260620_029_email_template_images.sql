-- Per-template hero image for emails, and seed the 10 lifecycle templates as
-- editable rows so they show up (and can be themed) in admin. Additive + idempotent.
alter table email_templates add column if not exists header_image text;

insert into email_templates (template_key, name, active)
select v.k, v.n, true
from (values
  ('account_magic_link',      'Login / sign-up link'),
  ('reservation_received',    'Reservation received'),
  ('deposit_confirmation',    'Deposit confirmed'),
  ('payment_pending_nudge',   'Deposit reminder'),
  ('balance_invoice_reminder','Balance invoice & reminder'),
  ('balance_paid_confirmation','Balance paid'),
  ('pre_trip_info',           'Pre-trip info'),
  ('pre_trip_final',          'Final details'),
  ('post_trip_thank_you',     'Thank you + review'),
  ('addon_confirmed',         'Add-on confirmed')
) as v(k, n)
where not exists (select 1 from email_templates e where e.template_key = v.k);
