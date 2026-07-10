-- "Signature Trips" — the PUBLIC invite-only trip application funnel (the
-- outsider-facing counterpart to the insider trip-interest surveys). People Nico
-- doesn't know yet apply to be considered for special trips (Madagascar/Mauritius
-- style). A guest application: name/email/phone + level + what they want, plus a
-- short pitch VIDEO or VOICE recorded in-browser (stored privately in R2).
--
-- Access: public submit + admin review both run through server APIs with the
-- service-role client. RLS on, NO anon policies (anon gets nothing).
-- Manual migration — paste in the Supabase SQL editor.

create table if not exists exp_trip_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  level text,                 -- self-declared riding level
  wants text,                 -- free text: which trip / where they dream of going
  motivation text,            -- free text "why me" (optional when they record a pitch)
  media_key text,             -- R2 object key for the pitch clip (private, presigned playback)
  media_type text check (media_type in ('video', 'audio')),
  -- Double opt-in: guests apply then click a magic link to "make it real". Only
  -- verified applications are shown to admin / count as real. Logged-in members
  -- are verified on submit.
  verified boolean not null default false,
  status text not null default 'new' check (status in ('new', 'shortlisted', 'accepted', 'declined')),
  admin_notes text,
  contact_id uuid references contacts(id) on delete set null,  -- linked once they get an account
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_trip_applications_status on exp_trip_applications(status);
create index if not exists idx_trip_applications_created on exp_trip_applications(created_at desc);

alter table exp_trip_applications enable row level security;
