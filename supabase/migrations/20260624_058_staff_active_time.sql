-- ============================================================
-- 20260624_058_staff_active_time.sql
--   Heartbeat-based staff active-time tracking. The admin panel pings while a
--   member is active; we accumulate active seconds per member per day (idle gaps
--   excluded). Surfaced on Hours Log as a "log your tracked time" SUGGESTION —
--   never auto-logged; the member attributes + confirms it into hours_log.
--   Additive + idempotent.
-- ============================================================

create table if not exists staff_active_time (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references team_members(id) on delete cascade,
  date          date not null,                       -- the member's LOCAL calendar day
  active_seconds int  not null default 0,            -- accumulated active time (idle excluded)
  last_ping_at  timestamptz,                         -- last heartbeat, to measure the next gap
  confirmed_at  timestamptz,                         -- set once logged to hours_log (or dismissed) → stops suggesting
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (employee_id, date)
);

alter table staff_active_time enable row level security;
drop policy if exists "service all staff_active_time" on staff_active_time;
create policy "service all staff_active_time" on staff_active_time for all using (true);

create index if not exists idx_staff_active_time_emp_date on staff_active_time(employee_id, date);
