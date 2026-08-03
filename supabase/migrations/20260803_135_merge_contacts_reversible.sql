-- 135 · Make a contact merge survivable and undoable.
--
-- Two defects in 132's merge_contacts, both found by measuring rather than
-- reasoning:
--
--  1) COLLISIONS ABORT THE MERGE. Eleven tables carry a unique constraint that
--     includes contact_id — "one rating per spot per person", "one invite per
--     survey per person". When BOTH records did the same thing, moving the
--     second one's row onto the survivor violates that constraint and the whole
--     merge rolls back with a database error. Of the 126 candidate pairs today,
--     4 fail exactly this way (3 share a survey invite, 1 a milestone).
--     Fixed by dropping the merged side's row when the survivor already has an
--     equivalent one — it is the same person, so the duplicate says nothing new
--     — and keeping its full content in the log so nothing is truly lost.
--
--  2) THE LOG RECORDED COUNTS, NOT ROWS. `moved` stored {table, column, rows:3},
--     which tells you three rows moved but not WHICH three — and once they point
--     at the survivor nothing distinguishes them from rows that were always his.
--     A merge was auditable but not reversible. It now records every moved row's
--     id and every dropped row in full, so unmerge_contacts() can put them back.

create or replace function merge_contacts(p_survivor uuid, p_merged uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  moved jsonb := '[]'::jsonb;
  dropped jsonb := '[]'::jsonb;
  pkcols text[];
  gone jsonb;
  pred text;
  snap jsonb;
  surv contacts%rowtype;
begin
  if p_survivor = p_merged then
    raise exception 'survivor and merged are the same contact';
  end if;
  select * into surv from contacts where id = p_survivor;
  if not found then raise exception 'survivor contact not found'; end if;
  select to_jsonb(c) into snap from contacts c where c.id = p_merged;
  if snap is null then raise exception 'merged contact not found'; end if;

  -- Never lose an address.
  insert into contact_emails (contact_id, email, source)
  select p_survivor, e, 'merge:' || p_merged
  from (
    select distinct lower(trim(x)) as e
    from unnest(array[snap->>'email', snap->>'email2', surv.email, surv.email2]) as x
  ) t
  where e is not null and e <> ''
  on conflict (contact_id, email) do nothing;

  -- Fill the survivor's gaps; never overwrite what it already has.
  update contacts set
    phone         = coalesce(phone, snap->>'phone'),
    location      = coalesce(location, snap->>'location'),
    country       = coalesce(country, snap->>'country'),
    date_of_birth = coalesce(date_of_birth, (snap->>'date_of_birth')::date),
    email2        = coalesce(email2, nullif(snap->>'email', email))
  where id = p_survivor;

  for r in
    select con.conrelid::regclass::text as tbl, att.attname as col
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and con.confrelid = 'contacts'::regclass
      and con.conrelid not in ('contact_merges'::regclass, 'contact_emails'::regclass)
  loop
    -- Any unique constraint on this table that includes the FK column turns a
    -- blind UPDATE into an abort. Clear the colliding rows first: same person,
    -- same spot, same rating slot — the merged side's copy is redundant.
    for u in
      select array_agg(quote_ident(a.attname)) filter (where a.attname <> r.col) as others
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = r.tbl::regclass
        and c.contype in ('u', 'p')
        and r.col = any (select att2.attname from pg_attribute att2
                         where att2.attrelid = c.conrelid and att2.attnum = any (c.conkey))
      group by c.oid
    loop
      if u.others is not null and array_length(u.others, 1) > 0 then
        pred := (select string_agg(format('a.%1$s is not distinct from b.%1$s', o), ' and ')
                 from unnest(u.others) o);
        execute format(
          'with doomed as (delete from %1$s a where a.%2$I = $1 and exists ('
          || 'select 1 from %1$s b where b.%2$I = $2 and %3$s) returning a.*) '
          || 'select coalesce(jsonb_agg(to_jsonb(doomed)), ''[]''::jsonb) from doomed',
          r.tbl, r.col, pred)
          into gone using p_merged, p_survivor;
        if jsonb_array_length(gone) > 0 then
          dropped := dropped || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', gone);
        end if;
      end if;
    end loop;

    -- Now the move is safe. Record WHICH rows moved, by primary key — not by
    -- an "id" column, which contact_milestones (PK: contact_id + milestone_id)
    -- and any future join table simply do not have.
    select coalesce(array_agg(a.attname), '{}')
      into pkcols
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = r.tbl::regclass and c.contype = 'p';

    execute format(
      'with m as (update %1$s t set %2$I = $1 where %2$I = $2 returning t.*) '
      || 'select coalesce(jsonb_agg(to_jsonb(m)), ''[]''::jsonb) from m', r.tbl, r.col)
      into gone using p_survivor, p_merged;
    if jsonb_array_length(gone) > 0 then
      moved := moved || jsonb_build_object(
        'table', r.tbl, 'column', r.col, 'pk', to_jsonb(pkcols), 'rows', gone);
    end if;
  end loop;

  insert into contact_merges (survivor_id, merged_id, merged_snapshot, moved)
  values (p_survivor, p_merged, snap,
          jsonb_build_object('moved', moved, 'dropped', dropped));

  update contacts
  set archived_at = coalesce(archived_at, now()),
      notes = trim(coalesce(notes, '') || e'\n[merged into ' || p_survivor || ' on ' || now()::date || ']')
  where id = p_merged;

  return jsonb_build_object('survivor', p_survivor, 'merged', p_merged,
                            'moved', moved, 'dropped', dropped);
end
$$;

/**
 * Undo one merge, by its log id.
 *
 * Puts every moved row back on the original contact, restores the rows that
 * were dropped as duplicates, and un-archives the record. Only possible
 * because the log now names rows instead of counting them.
 */
create or replace function unmerge_contacts(p_merge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec contact_merges%rowtype;
  m jsonb;
  d jsonb;
  row_js jsonb;
  pred text;
  n int := 0;
begin
  select * into rec from contact_merges where id = p_merge_id;
  if not found then raise exception 'merge log entry not found'; end if;

  for m in select * from jsonb_array_elements(rec.moved->'moved') loop
    for row_js in select * from jsonb_array_elements(m->'rows') loop
      -- Match on the primary key as it stands NOW: for a table whose PK
      -- includes contact_id, the merge changed that value to the survivor's.
      pred := (select string_agg(
                 format('%I = %L', k,
                   case when k = m->>'column' then rec.survivor_id::text
                        else row_js->>k end), ' and ')
               from jsonb_array_elements_text(m->'pk') k);
      execute format('update %s set %I = $1 where %s', m->>'table', m->>'column', pred)
        using rec.merged_id;
      n := n + 1;
    end loop;
  end loop;

  for d in select * from jsonb_array_elements(rec.moved->'dropped') loop
    execute format('insert into %s select * from jsonb_populate_recordset(null::%s, $1) on conflict do nothing',
                   d->>'table', d->>'table')
      using d->'rows';
  end loop;

  update contacts set archived_at = null where id = rec.merged_id;
  delete from contact_merges where id = p_merge_id;
  return jsonb_build_object('restored_rows', n, 'contact', rec.merged_id);
end
$$;

revoke execute on function merge_contacts(uuid, uuid) from public, anon, authenticated;
revoke execute on function unmerge_contacts(uuid) from public, anon, authenticated;
