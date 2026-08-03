-- AI Magazine intake queue: a pasted link or a pile of notes waiting to become
-- a post. When the platform has an ANTHROPIC_API_KEY the intake route drafts it
-- immediately and parks the draft in `notes`; without one the raw text simply
-- waits here for a human. Nothing publishes itself — a person presses the
-- button that turns a queued draft into a DRAFT post, and post_id records which.
create table if not exists blog_intake_queue (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,
  status        text not null default 'pending',  -- pending | processed | discarded
  post_id       uuid,                             -- the draft post a human created from it
  notes         jsonb,                            -- the AI draft + its uncertainties, for the reviewer
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

-- The queue is read as "what still needs me?" on every visit to the Magazine.
create index if not exists blog_intake_queue_status_idx on blog_intake_queue (status, created_at desc);

-- Service-role only (admin routes); no anon/authenticated access.
alter table blog_intake_queue enable row level security;
