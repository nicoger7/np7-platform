-- Text of the single "open the survey" button in the invite email (used when
-- email_date_buttons is off). Separate from cta_label, which drives the
-- per-date buttons and the survey page cards. null = "Take the 2-minute survey".
alter table exp_surveys add column if not exists email_button_label text;
