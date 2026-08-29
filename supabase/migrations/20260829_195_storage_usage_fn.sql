-- How much is in storage, without walking the bucket.
--
-- The File Storage page had no idea how big the library was, and the honest way
-- to find out — listing every key — costs thousands of requests and gets slower
-- every week. `storage.objects` already records each object's size, so one
-- aggregate answers it and keeps answering it as the library grows.
--
-- SECURITY DEFINER because `storage.objects` is not readable by the app's roles,
-- and execute is granted ONLY to service_role: the route behind it already
-- requires an active team member, so nothing anonymous can reach it.
create or replace function storage_usage_by_folder()
returns table(folder text, files bigint, bytes bigint)
language sql
security definer
set search_path = storage, public
as $fn$
  select split_part(name, '/', 1) as folder,
         count(*)::bigint          as files,
         coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes
    from storage.objects
   where bucket_id = 'assets'
   group by 1
   order by 3 desc;
$fn$;

revoke all on function storage_usage_by_folder() from public, anon, authenticated;
grant execute on function storage_usage_by_folder() to service_role;

-- The same reading, scoped to one prefix — "what does THIS week's memories
-- occupy", which is the number that means something on the week's own page.
create or replace function storage_usage_for_prefix(p_prefix text)
returns table(files bigint, bytes bigint)
language sql
security definer
set search_path = storage, public
as $fn$
  select count(*)::bigint,
         coalesce(sum((metadata->>'size')::bigint), 0)::bigint
    from storage.objects
   where bucket_id = 'assets' and name like p_prefix || '%';
$fn$;

revoke all on function storage_usage_for_prefix(text) from public, anon, authenticated;
grant execute on function storage_usage_for_prefix(text) to service_role;
