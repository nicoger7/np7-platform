-- 252 · How often each spotguide destination was actually opened
--
-- The spotguide index listed destinations by a hand-set sort_order, then name,
-- so the page opened on whatever was typed first rather than on what people
-- read. Nico, 20 Sep 2026: order them by most viewed. The numbers are already
-- there (analytics_events, migration 038): Sørlandet 739 views, Paracas 209,
-- Fuerteventura 169, while others have none.
--
-- A function rather than a query from the page, for two reasons. analytics_events
-- is not readable by the anon key (and must not be: it is visitor behaviour),
-- and the page must not pull thousands of rows to count them. This returns one
-- row per destination slug, counted in Postgres.
--
-- security definer + a pinned search_path: it reads the events table on the
-- caller's behalf but exposes nothing except a slug and a count, which is the
-- same aggregate the public page is about to print anyway.

create or replace function public.spotguide_view_counts(days integer default 180)
returns table (slug text, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select split_part(path, '/', 3) as slug, count(*)::bigint as views
  from public.analytics_events
  where event = 'pageview'
    and path like '/spotguide/%'
    and ts > now() - make_interval(days => greatest(days, 1))
  group by 1
  having split_part(path, '/', 3) <> ''
$$;

comment on function public.spotguide_view_counts(integer) is
  'Pageviews per spotguide destination slug in the last N days. Used to order the spotguide index by what people actually read. Aggregate only, no visitor data leaves the function.';

revoke all on function public.spotguide_view_counts(integer) from public;
grant execute on function public.spotguide_view_counts(integer) to anon, authenticated, service_role;

-- The count scans by path; the window then trims by ts.
create index if not exists analytics_events_spotguide_path_idx
  on public.analytics_events (path, ts)
  where event = 'pageview';
