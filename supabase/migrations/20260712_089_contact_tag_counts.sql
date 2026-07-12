-- Tag autocomplete for audience pickers (survey invites etc.): every contact tag
-- with its live count. security_invoker so the view inherits contacts' RLS —
-- anon stays locked out; the admin API reads it with the service role.
create or replace view contact_tag_counts with (security_invoker = on) as
  select t.tag, count(*)::int as count
  from contacts c, unnest(c.tags) as t(tag)
  where c.archived_at is null and c.email is not null
  group by t.tag;
