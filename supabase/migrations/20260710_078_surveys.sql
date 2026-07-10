-- Hidden, invite-only "trip interest" surveys.
-- Nico hand-picks members and sends them a secret link to gauge demand for a
-- special (non-public) trip: where they'd want to go (from a shortlist he sets),
-- which of a few week-windows they're free, a budget comfort RANGE anchored on a
-- target figure, and what they want out of the trip.
--
-- Access model: token link, no login required — the member form reads/writes via
-- a server API using the service-role client (token-authed). RLS is ON with NO
-- anon policies, so anon/public gets nothing; service role bypasses RLS.
-- Manual migration — paste in the Supabase SQL editor.

create table if not exists exp_surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  intro text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  -- shortlist of candidate spots for THIS survey: [{ "key": "...", "label": "..." }]
  destinations jsonb not null default '[]'::jsonb,
  -- allowed week-windows: [{ "key": "...", "label": "...", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }]
  weeks jsonb not null default '[]'::jsonb,
  budget_anchor numeric,                 -- the "~€X" target shown as context
  budget_min numeric not null default 1000,   -- comfort-range slider bounds
  budget_max numeric not null default 8000,
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz               -- soft delete (platform convention)
);

create table if not exists exp_survey_invites (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references exp_surveys(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  token text not null unique,           -- the secret link component
  status text not null default 'invited' check (status in ('invited', 'opened', 'completed')),
  invited_at timestamptz not null default now(),
  opened_at timestamptz,
  unique (survey_id, contact_id)        -- one invite per member per survey
);

create table if not exists exp_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references exp_surveys(id) on delete cascade,
  invite_id uuid not null unique references exp_survey_invites(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  top_destination text,                 -- chosen destination key (their #1)
  other_destinations jsonb not null default '[]'::jsonb,   -- also-up-for keys
  weeks jsonb not null default '[]'::jsonb,                -- selected week keys
  budget_ok text check (budget_ok in ('yes', 'maybe', 'no')),  -- optional signal
  budget_min numeric,                   -- their comfort range
  budget_max numeric,
  looking_for text,                     -- free text: what they want from the trip
  submitted_at timestamptz not null default now()
);

create index if not exists idx_survey_invites_survey on exp_survey_invites(survey_id);
create index if not exists idx_survey_invites_token on exp_survey_invites(token);
create index if not exists idx_survey_responses_survey on exp_survey_responses(survey_id);

-- RLS on, no anon policies (service role only — same posture as migration 072).
alter table exp_surveys enable row level security;
alter table exp_survey_invites enable row level security;
alter table exp_survey_responses enable row level security;
