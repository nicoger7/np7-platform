-- 249 · "Don't send this mail for this week"
--
-- Every on/off switch for a mail was GLOBAL (Emails → switch): turning the
-- waiver reminder off for one clinic turned it off for every trip. Nico asked
-- for the per-week version: a mail that should simply not go out for OBX Wind,
-- without touching Bonaire.
--
-- A list of template keys on the edition. Additive, defaulted, touches no
-- existing row, so there is nothing to check before applying.
--
-- Read by: the email cron's single send helper (skips the mail for bookings on
-- this edition, WITHOUT burning its dedupe key, so switching it back on before
-- the window closes still sends), the Mailing tab's manual send and the held-
-- mail release (both refuse), and the Mailing tab row (shows it as skipped).

alter table public.exp_editions
  add column if not exists mail_skip text[] not null default '{}';

comment on column public.exp_editions.mail_skip is
  'Scheduled mail template keys that must not be sent for this edition. Per-week opt-out, set from the Mailing tab.';

notify pgrst, 'reload schema';
