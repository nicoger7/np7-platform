-- Migration 016: Member area — accounts, email log, member RLS
-- Customer portal foundation: link contacts to Supabase auth users, track Stripe
-- customer + marketing consent, external memories video link, a stable email
-- template key, and an idempotent email log. Members get read access to their
-- own contact + bookings (portal data still served via service-role routes).

-- contacts: account linkage, payments, marketing consent
alter table contacts add column if not exists auth_user_id        uuid unique;
alter table contacts add column if not exists stripe_customer_id   text;
alter table contacts add column if not exists marketing_opt_in     boolean not null default false;
alter table contacts add column if not exists marketing_opt_in_at  timestamptz;

-- editions: external link for week memories (videos live off-platform)
alter table exp_editions add column if not exists memories_video_url text;

-- email templates: stable code key (overrides default content by key)
alter table email_templates add column if not exists template_key text;
create unique index if not exists email_templates_key_uidx
  on email_templates(template_key) where template_key is not null;

-- email log — every send attempt, idempotent via dedupe_key
create table if not exists email_log (
  id           uuid primary key default gen_random_uuid(),
  template_key text,
  rule_id      uuid,
  booking_id   uuid references exp_bookings(id) on delete set null,
  contact_id   uuid references contacts(id) on delete set null,
  to_email     text not null,
  subject      text,
  status       text not null default 'queued',  -- queued | sent | failed | skipped
  provider_id  text,
  error        text,
  dedupe_key   text unique,
  created_at   timestamptz default now(),
  sent_at      timestamptz
);
create index if not exists email_log_booking_idx on email_log(booking_id);
create index if not exists email_log_status_idx  on email_log(status);

-- RLS
alter table email_log enable row level security;
drop policy if exists "email_log team" on email_log;
create policy "email_log team" on email_log for all
  using (is_team_member()) with check (is_team_member());

-- members can read/update their own contact (additive to existing team policies)
drop policy if exists "contacts own read" on contacts;
create policy "contacts own read" on contacts for select
  using (auth_user_id = auth.uid() or is_team_member());
drop policy if exists "contacts own update" on contacts;
create policy "contacts own update" on contacts for update
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- members can read their own bookings
drop policy if exists "bookings own read" on exp_bookings;
create policy "bookings own read" on exp_bookings for select
  using (is_team_member() or contact_id in (select id from contacts where auth_user_id = auth.uid()));
