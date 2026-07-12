-- jibe heartbeat: one row per jibe run (even a "nothing to do" run), so the
-- admin can tell "queue is empty" apart from "jibe stopped showing up".
-- Written by jibe via PostgREST (service role); read by the spotguide admin.
create table if not exists jibe_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,                       -- 'spotguide' (later: 'payments', …)
  ran_at timestamptz not null default now(),
  structured int not null default 0,       -- Job A: spots structured this run
  merged int not null default 0,           -- Job B: tips folded in this run
  summary text,                            -- one human line, e.g. "nothing to do"
  meta jsonb
);
create index if not exists jibe_runs_job_ran_idx on jibe_runs (job, ran_at desc);
-- zero-policy RLS: service-role only, invisible to anon/authenticated
alter table jibe_runs enable row level security;
