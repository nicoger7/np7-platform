-- ============================================================================
-- 154 — wind.coach training guides land in the platform (integration Phase 1).
--
-- Today the guide leaves wind.coach as a browser download that Nico emails by
-- hand. This table is where the webhook (docs/windcoach-integration-brief.md
-- §3) puts it instead: matched to a booking when email + trip window agree,
-- parked as 'review' when they don't — matching is never guessed.
--
-- focus_points carries the FULL block structure (what-to-do/how/why/common-
-- mistakes/coach-tip per point), because the member sees a native NP7-designed
-- guide page; the PDF is just the download button on it.
-- ============================================================================

create table if not exists windcoach_guides (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  booking_id uuid references exp_bookings(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  name text,
  trip_label text,
  trip_start date,
  trip_end date,
  focus_points jsonb not null default '[]'::jsonb,
  coach_note text,
  source_pdf_url text,
  pdf_url text,                       -- NP7-mirrored copy (source links expire ≤7d)
  generated_at timestamptz,
  status text not null default 'review' check (status in ('stored','review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wcg_booking on windcoach_guides(booking_id);
create index if not exists idx_wcg_status on windcoach_guides(status);
alter table windcoach_guides enable row level security;
