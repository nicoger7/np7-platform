-- 113: make the last hardcoded experience-page sections editable.
-- NULL / empty array = keep the built-in defaults (nothing changes visually
-- until an experience actually edits these).
alter table exp_content
  add column if not exists week_title text,
  add column if not exists week_outcomes jsonb,
  add column if not exists method_intro text,
  add column if not exists method_steps jsonb;
