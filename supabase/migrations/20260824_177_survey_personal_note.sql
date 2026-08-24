-- Per-survey personal note (the gold line under the hero copy).
-- {name} is replaced with the invitee's first name.
-- null = default line · "" = hidden · anything else = shown verbatim.
alter table exp_surveys add column if not exists personal_note text;
