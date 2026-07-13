-- Per-survey eyebrow (the small gold line above the hero title).
-- null = default "By private invitation" · "" = hidden · anything else = shown verbatim.
alter table exp_surveys add column if not exists eyebrow text;
