-- 050: "Invite a friend to a trip" — two-sided-reward referral.
-- Additive only (Notion↔Supabase sync rule). Service-role only access (admin
-- client + server-rendered public join page); RLS on with no policies = deny any
-- direct anon/authenticated client, service role bypasses.

create table if not exists trip_invites (
  id                        uuid primary key default gen_random_uuid(),
  token                     text unique not null,
  inviter_contact_id        uuid references contacts(id),
  inviter_booking_id        uuid references exp_bookings(id),
  experience_id             uuid references exp_experiences(id),
  edition_id                uuid references exp_editions(id),
  package_id                uuid references exp_packages(id),
  invitee_name              text,
  invitee_email             text,
  note                      text,
  status                    text not null default 'sent'
                              check (status in ('sent','opened','booked','expired','cancelled')),
  invited_contact_id        uuid references contacts(id),
  invited_booking_id        uuid references exp_bookings(id),
  reward_friend_amount      numeric,
  reward_inviter_amount     numeric,
  reward_status             text not null default 'pending'
                              check (reward_status in ('pending','granted','void')),
  reward_inviter_voucher_id uuid,
  reward_friend_voucher_id  uuid,
  opened_at                 timestamptz,
  booked_at                 timestamptz,
  created_at                timestamptz not null default now()
);

create index if not exists trip_invites_inviter_idx on trip_invites(inviter_contact_id);
create index if not exists trip_invites_token_idx   on trip_invites(token);
create index if not exists trip_invites_status_idx  on trip_invites(status);

alter table trip_invites enable row level security;

-- Attribution: which invite a booking came from.
alter table exp_bookings add column if not exists invite_id uuid references trip_invites(id);

-- Per-edition reward override (falls back to the code default when null).
alter table exp_editions add column if not exists invite_reward_friend  numeric;
alter table exp_editions add column if not exists invite_reward_inviter numeric;
