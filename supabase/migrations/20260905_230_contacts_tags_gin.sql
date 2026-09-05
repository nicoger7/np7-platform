-- The one query the region move could not speed up.
--
-- pg_stat_statements put contacts at 150 to 190 ms mean INSIDE Postgres, which
-- is server time, not geography. Every one of those was a tag filter:
-- `tags && array[...]` or `tags @> ...`, over 14.7k rows, with no index on
-- tags at all. The campaign audience resolver pages through exactly that
-- filter for every send, the admin contacts list runs it on every pill click,
-- and both Bonaire waves this weekend select their recipients with it.
--
-- GIN is the index type for array containment and overlap. Additive, no data
-- touched.

create index if not exists contacts_tags_gin_idx
  on public.contacts using gin (tags);

-- The audience filter's fixed predicates. Partial, so it is small and only ever
-- consulted for the thing it exists for: who may be mailed.
create index if not exists contacts_mailable_idx
  on public.contacts (marketing_opt_in)
  where marketing_opt_in = true and archived_at is null and email_bounced_at is null;
