-- Waiver e-signature. Per-experience waiver text (override; default lives in code,
-- like the email templates). One signature per PARTICIPANT (per booking), with an
-- audit trail. Travel partner + level already exist (exp_bookings.partner_tag_along,
-- exp_bookings.level). Additive + idempotent.
alter table exp_experiences add column if not exists waiver_text text;

create table if not exists exp_waiver_signatures (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references exp_bookings(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete set null,
  experience_id uuid references exp_experiences(id) on delete set null,
  version       int not null default 1,
  signed_name   text not null,
  signature_image text,                 -- data URL (PNG) of the drawn signature
  signed_at     timestamptz not null default now(),
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  unique (booking_id)
);

alter table exp_waiver_signatures enable row level security;
drop policy if exists "waiver team" on exp_waiver_signatures;
create policy "waiver team" on exp_waiver_signatures for all using (is_team_member());
drop policy if exists "waiver own read" on exp_waiver_signatures;
create policy "waiver own read" on exp_waiver_signatures for select using (
  booking_id in (select id from exp_bookings where contact_id in (select id from contacts where auth_user_id = auth.uid()))
);
