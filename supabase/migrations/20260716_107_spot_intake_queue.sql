-- AI spot intake queue: free text waiting for jibe. The admin (or later a
-- member flow) drops raw spot descriptions here; jibe structures them into
-- draft spots on its ~4-hourly spotguide run and marks them done. If the
-- platform ever gets its own ANTHROPIC_API_KEY, the intake route structures
-- instantly instead and this queue simply stays empty.
create table if not exists spot_intake_queue (
  id              uuid primary key default gen_random_uuid(),
  text            text not null,
  status          text not null default 'pending',  -- pending | done | failed
  spot_id         uuid,                             -- the draft spot jibe created
  destination_id  uuid,                             -- (new draft area, if one was needed)
  notes           jsonb,                            -- jibe's uncertainties, for the human reviewer
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

-- Service-role only (admin route + jibe); no anon/authenticated access.
alter table spot_intake_queue enable row level security;
