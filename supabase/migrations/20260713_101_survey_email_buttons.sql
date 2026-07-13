-- One-tap date buttons in the invite email for ANY survey with dated trips
-- (not just quick mode): tapping a date in the email pre-registers it, the
-- page opens with it selected. false = single "open the survey" button
-- (its label = cta_label, default "Take the 2-minute survey").
alter table exp_surveys add column if not exists email_date_buttons boolean not null default true;
