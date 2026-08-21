-- Early access (loyalty perk): a published edition can be held back from the
-- public until `public_from` — Crew/Legend members book before everyone else.
-- NULL = public immediately (every existing edition keeps today's behaviour).
alter table exp_editions add column if not exists public_from date;
