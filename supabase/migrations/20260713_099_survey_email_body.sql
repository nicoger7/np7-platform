-- Per-survey invite email text: replaces the standard pitch paragraphs between
-- the greeting and the date buttons (greeting, buttons, opt-out and sign-off
-- stay). null = the built-in copy.
alter table exp_surveys add column if not exists email_body text;
