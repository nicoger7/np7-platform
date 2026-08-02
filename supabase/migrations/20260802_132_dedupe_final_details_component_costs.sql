-- 132 · The session's approved-but-unbuilt pieces, in one additive migration.
--
--  a) exp_editions.final_details_note — the 3-day "Final details" mail had no
--     per-edition content at all, and the 21d/12d mails shared one note.
--  b) exp_costs.component_id — a cost line can now BE a component's actual,
--     overriding the qty×unit_cost estimate. One actual per component per week.
--  c) contact_emails + contact_merges + merge_contacts() — the dedupe Nico
--     approved: merge on a human decision, never lose an address, survivor is
--     the account row, every FK moved dynamically so new tables can't be missed.
--  d) exp_bookings.terms_accepted_at — the trip flow recorded no terms
--     acceptance while hardware checkout did.
--
-- Additive only (Notion sync rule): nothing dropped, nothing overwritten.

alter table exp_editions add column if not exists final_details_note text;

alter table exp_costs add column if not exists component_id uuid references exp_components(id) on delete set null;
create unique index if not exists exp_costs_one_actual_per_component
  on exp_costs (edition_id, component_id) where component_id is not null;

alter table exp_bookings add column if not exists terms_accepted_at timestamptz;

-- ── every address a person has ever reached us from ─────────────────────────
create table if not exists contact_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  email text not null,
  source text,                       -- 'merge:<uuid>', 'import', 'manual'
  created_at timestamptz not null default now(),
  unique (contact_id, email)
);
alter table contact_emails enable row level security;

-- ── the merge log: enough to see, and to unpick by hand if ever needed ──────
create table if not exists contact_merges (
  id uuid primary key default gen_random_uuid(),
  survivor_id uuid not null references contacts(id),
  merged_id uuid not null,
  merged_snapshot jsonb not null,    -- the merged row, complete, at merge time
  moved jsonb not null,              -- [{table, column, rows}] actually updated
  created_at timestamptz not null default now()
);
alter table contact_merges enable row level security;

-- ── the merge itself ────────────────────────────────────────────────────────
-- FKs are discovered from the catalog at run time: 33 columns across 30 tables
-- point at contacts(id) today, and a hand-kept list would silently rot the
-- first time a new one appears. Atomic — any conflict aborts the whole merge.
create or replace function merge_contacts(p_survivor uuid, p_merged uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  moved jsonb := '[]'::jsonb;
  cnt int;
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

  -- Never lose an address: both rows' emails land in the side table.
  insert into contact_emails (contact_id, email, source)
  select p_survivor, e, 'merge:' || p_merged
  from (
    select distinct lower(trim(x)) as e
    from unnest(array[snap->>'email', snap->>'email2', surv.email, surv.email2]) as x
  ) t
  where e is not null and e <> ''
  on conflict (contact_id, email) do nothing;

  -- Fill gaps on the survivor from the merged row — records with values win,
  -- the survivor's own values are never overwritten.
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
      and con.conrelid <> 'contact_merges'::regclass
      and con.conrelid <> 'contact_emails'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col)
      using p_survivor, p_merged;
    get diagnostics cnt = row_count;
    if cnt > 0 then
      moved := moved || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', cnt);
    end if;
  end loop;

  insert into contact_merges (survivor_id, merged_id, merged_snapshot, moved)
  values (p_survivor, p_merged, snap, moved);

  -- The merged row stays as an archived shell — auditable, out of every list.
  update contacts
  set archived_at = coalesce(archived_at, now()),
      notes = trim(coalesce(notes, '') || e'\n[merged into ' || p_survivor || ' on ' || now()::date || ']')
  where id = p_merged;

  return jsonb_build_object('survivor', p_survivor, 'merged', p_merged, 'moved', moved);
end
$$;

revoke execute on function merge_contacts(uuid, uuid) from public, anon, authenticated;
