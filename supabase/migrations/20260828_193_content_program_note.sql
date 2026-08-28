-- The caveat under the day-by-day.
--
-- "This is what the ideal week looks like — the exact day-to-day depends on the
-- wind" was hardcoded in the trip page's JSX. It is the one line that stops a
-- published schedule reading as a promise, so it has to appear on clinics too —
-- and the moment two pages print it, it needs one editable home rather than two
-- copies drifting apart in code.
--
-- Null = show the shipped default, the same convention every other content
-- field on this table uses.
alter table exp_content
  add column if not exists program_note text;

comment on column exp_content.program_note is
  'Caveat shown under the day-by-day. Null = the default "depends on the wind" line.';
