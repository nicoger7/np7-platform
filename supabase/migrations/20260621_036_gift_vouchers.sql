-- ============================================================
-- 20260621_034_gift_vouchers.sql
--   Gift vouchers — each voucher is for a specific experience (a trip, never a
--   value trinket), bought by a signed-in member and paid by bank transfer
--   (team-confirmed, like a deposit). Lives in the buyer's account, can be
--   gifted to a recipient, and is redeemed against a booking. Valid 1 year at
--   today's price; 50% refundable if unused after that.
-- ============================================================

create table if not exists gift_vouchers (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,                       -- printable redemption code
  buyer_contact_id     uuid references contacts(id) on delete set null,
  recipient_contact_id uuid references contacts(id) on delete set null, -- set once the gift is claimed
  recipient_name       text,                                       -- for the gift + printed voucher
  recipient_email      text,
  message              text,                                       -- personal note on the voucher
  experience_id        uuid references exp_experiences(id) on delete set null,
  package_id           uuid references exp_packages(id) on delete set null,
  amount               numeric,                                    -- price locked at purchase
  currency             text default 'EUR',
  status               text not null default 'pending'
    check (status in ('pending','active','redeemed','expired','refunded','cancelled')),
  paid_at              timestamptz,
  issued_at            timestamptz,                                -- activated (payment confirmed)
  redeem_by            date,                                       -- issued + 1 year
  redeemed_booking_id  uuid references exp_bookings(id) on delete set null,
  redeemed_at          timestamptz,
  notes                text,
  created_at           timestamptz not null default now()
);

create index if not exists idx_gift_vouchers_buyer     on gift_vouchers(buyer_contact_id);
create index if not exists idx_gift_vouchers_recipient on gift_vouchers(recipient_contact_id);

alter table gift_vouchers enable row level security;

drop policy if exists "gift_vouchers team" on gift_vouchers;
create policy "gift_vouchers team" on gift_vouchers for all using (is_team_member()) with check (is_team_member());

-- A member can read vouchers they bought OR received.
drop policy if exists "gift_vouchers own" on gift_vouchers;
create policy "gift_vouchers own" on gift_vouchers for select using (
  buyer_contact_id in (select id from contacts where auth_user_id = auth.uid())
  or recipient_contact_id in (select id from contacts where auth_user_id = auth.uid())
);
