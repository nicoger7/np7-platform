-- Slimmed "event" experiences (1–2 day clinics, ticket-first, often for locals).
-- An event is an exp_experiences row with page_template = 'event'.
--
-- event_mode:
--   'fixed'   → one confirmed date; buyer pays 100% up front via Stripe.
--   'standby' → several candidate dates; buyer marks which they can make and pays
--               a non-refundable deposit (default 20%). When one date is later
--               confirmed, the available buyers pay the balance; the rest are
--               refunded event_refund_pct (default 15%, we keep 5% for fees).
alter table exp_experiences add column if not exists event_mode text;              -- 'fixed' | 'standby' | null
alter table exp_experiences add column if not exists event_deposit_pct int not null default 20;
alter table exp_experiences add column if not exists event_refund_pct int not null default 15;

-- Candidate / confirmed dates for an event (a light alternative to full editions).
create table if not exists exp_event_dates (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references exp_experiences(id) on delete cascade,
  date_start date not null,
  date_end date,
  label text,
  status text not null default 'candidate',   -- 'candidate' | 'confirmed' | 'cancelled'
  max_spots int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_event_dates_exp on exp_event_dates(experience_id);
-- Locked by default (zero policies): read server-side with the service-role client,
-- same pattern as exp_packages / exp_hotel_rooms on the public destination page.
alter table exp_event_dates enable row level security;

-- Ticket bookings reuse exp_bookings. Two extra columns:
--   event_date_ids       — standby: the dates the buyer marked they can make;
--                          fixed: the single confirmed date.
--   stripe_payment_intent — the deposit's PaymentIntent, kept so we can later
--                          charge the balance or issue a partial refund.
alter table exp_bookings add column if not exists event_date_ids uuid[];
alter table exp_bookings add column if not exists stripe_payment_intent text;
create index if not exists idx_bookings_event_dates on exp_bookings using gin (event_date_ids);
