-- Editable quick-survey button labels + optional decline.
-- cta_label      null = "Count me in" on the page / "I'd join" in the email buttons
-- decline_label  null = "Can't make it this time" (display only — the stored
--                decline note keeps the fixed sentinel so detection never breaks)
-- show_decline   false = no opt-out button on the page and no decline link in the email
alter table exp_surveys
  add column if not exists cta_label text,
  add column if not exists decline_label text,
  add column if not exists show_decline boolean not null default true;
