-- Quick surveys: one-click interest mode. The invite email carries per-date
-- buttons whose links pre-register the answer; the page is an auto-saving
-- confirmation, not a form.
alter table exp_surveys add column if not exists quick boolean not null default false;
