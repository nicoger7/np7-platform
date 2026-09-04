-- Migration 223: take a cost out of the plan without deleting it, and record
-- who changed what.
--
-- Two things Nico asked for on 2026-09-04.
--
-- 1. "Easy to untick or hide a planned cost, so I can quickly see how that
--    would change the plan." Deleting it and typing it back is not that. A line
--    that is excluded still exists, keeps its allocations and its history, and
--    is simply left out of every total until it is ticked back on. The screen
--    always says how many are out and what they are worth, because a plan that
--    quietly omits things is worse than one that includes them.
--
-- 2. "If something is changed the system should save who changed it and what."
--    fin_audit is append-only: before and after as jsonb, the actor, and a
--    sentence a person can read. Writes go through the API, which holds the
--    service role, so a trigger could not see who the person was; the routes
--    know and record it.

alter table fin_plan_lines
  add column if not exists included boolean not null default true;

comment on column fin_plan_lines.included is
  'False = kept, but left out of every total. The what-if switch, not a delete.';

create index if not exists idx_fin_plan_lines_included on fin_plan_lines(plan_id, included);

create table if not exists fin_audit (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  row_id      uuid,
  action      text not null check (action in ('insert','update','delete')),
  -- Who. Both, because a member row can be renamed or removed and the audit
  -- must still say who it was at the time.
  actor_id    uuid references team_members(id) on delete set null,
  actor_name  text,
  summary     text not null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

comment on table fin_audit is
  'Append-only record of finance changes. Never updated, never deleted by the app.';

create index if not exists idx_fin_audit_row  on fin_audit(table_name, row_id, created_at desc);
create index if not exists idx_fin_audit_time on fin_audit(created_at desc);

alter table fin_audit enable row level security;
drop policy if exists "fin_audit team read" on fin_audit;
-- Readable by the team, written only by the service role behind the API. No
-- update or delete policy exists at all, which is what makes it append-only.
create policy "fin_audit team read" on fin_audit for select using (is_team_member());
