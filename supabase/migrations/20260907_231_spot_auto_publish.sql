-- Auto-published spots, and the evidence that published them.
--
-- A member's spot normally waits for three riders to confirm it. This records
-- the cases where the platform published one on its own, and exactly what it
-- knew at the time, so any decision can be read back and reversed.
--
-- Two places on purpose. The jsonb on the row is what the admin page shows next
-- to the spot. The table is append-only and survives the spot being archived or
-- deleted, which the column does not, and it is what the "one reversal and never
-- again" rule counts.

alter table spots add column if not exists auto_review jsonb;

-- Partial: only the handful of rows that were auto-published are ever queried
-- this way, and the volume caps count them per member.
create index if not exists spots_auto_review_idx on spots ((auto_review is not null))
  where auto_review is not null;

create table if not exists spot_auto_publish (
  id          uuid primary key default gen_random_uuid(),
  spot_id     uuid references spots(id) on delete set null,
  contact_id  uuid references contacts(id) on delete set null,
  -- The full decision: which gates passed, the trip that proved the member was
  -- there, the anchor spot and its distance, and the coordinates as submitted.
  payload     jsonb not null,
  -- Set when a rider flags the spot back down. One of these, ever, and this
  -- member never auto-publishes again.
  reversed_at timestamptz,
  reversed_by uuid references contacts(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists spot_auto_publish_contact_idx on spot_auto_publish (contact_id);
create index if not exists spot_auto_publish_spot_idx on spot_auto_publish (spot_id);

-- Service role only. This is an audit trail of a machine decision about a
-- member; nothing client-side has any business reading it.
alter table spot_auto_publish enable row level security;

notify pgrst, 'reload schema';
