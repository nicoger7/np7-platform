-- Card payments on request: a Stripe Checkout link an admin creates for one
-- booking, with the card cost added on top where the law allows it.
--
-- Bank transfer stays the default and is always free. The link exists for the
-- guest who asks to pay by card: the admin picks the amount, says which card
-- family it is for, and the fee is Stripe's own cost grossed up so NP7 nets the
-- amount (§312a Abs. 4 BGB: a fee only where a free common method exists and it
-- does not exceed the cost). EEA consumer cards carry no fee at all
-- (§270a BGB). The fee is recorded on the link, never as trip revenue.

-- The webhook writes the guest's payment with its own provenance: verifiable
-- through the Stripe payment intent, but never a row in the bank feed (the
-- payout arrives later, netted, in bulk).
alter table exp_payments drop constraint if exists exp_payments_provenance_check;
alter table exp_payments
  add constraint exp_payments_provenance_check
  check (provenance in ('bank', 'off_bank', 'unverified', 'legacy', 'stripe'));

comment on column exp_payments.provenance is
  'bank = created from a real bank_transactions row · off_bank = recorded by hand with a reason, money this system cannot see · stripe = written by the Stripe webhook, reference = payment intent · unverified = since the NP7 GmbH switch (2026-08-04) but not yet tied to the bank, still to be decided · legacy = before the switch, Surfcenter-era money, kept for booking balances and out of accounting';

create table if not exists exp_payment_links (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references exp_bookings(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete set null,
  document_id   uuid references documents(id) on delete set null,
  amount        numeric(12,2) not null check (amount > 0),
  fee           numeric(12,2) not null default 0 check (fee >= 0),
  total         numeric(12,2) not null check (total > 0),
  currency      text not null default 'EUR',
  card_region   text not null check (card_region in ('eea', 'eea_premium', 'uk', 'intl')),
  session_id    text unique,
  url           text,
  status        text not null default 'open' check (status in ('open', 'paid', 'expired', 'cancelled')),
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  paid_at       timestamptz,
  payment_id    uuid references exp_payments(id) on delete set null,
  payment_intent text
);
create index if not exists exp_payment_links_booking_idx on exp_payment_links (booking_id, created_at desc);

alter table exp_payment_links enable row level security;
drop policy if exists exp_payment_links_staff on exp_payment_links;
create policy exp_payment_links_staff on exp_payment_links
  for all to authenticated
  using (is_team_member())
  with check (is_team_member());

comment on table exp_payment_links is
  'A Stripe Checkout link made by hand for one booking. amount = what the trip is credited; fee = the card cost passed on (0 for EEA consumer cards); total = what the guest is charged.';
