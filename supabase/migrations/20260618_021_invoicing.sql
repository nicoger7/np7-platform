-- Invoicing & documents: per-division company settings, generated documents,
-- gapless invoice numbering, and customer billing address.
-- RLS: team-only (PDFs are rendered server-side with the service role; members
-- read their own docs through a portal API with an ownership check).
-- Idempotent. MANUAL apply.

-- ── Company / legal profile, one per division ──
create table if not exists company_settings (
  id            uuid primary key default gen_random_uuid(),
  division      text not null unique,           -- 'experience' | 'hardware'
  legal_name    text,
  address_line1 text,
  address_line2 text,
  postal_code   text,
  city          text,
  country       text,
  email         text,
  phone         text,
  website       text,
  vat_id        text,                            -- USt-IdNr
  tax_number    text,                            -- Steuernummer
  register_info text,                            -- e.g. "Amtsgericht …, HRB …"
  managing_director text,
  iban          text,
  bic           text,
  bank_name     text,
  logo_url      text,
  currency      text not null default 'EUR',
  vat_mode      text not null default 'margin',  -- 'margin' (§25) | 'standard'
  vat_rate      numeric,                         -- used when vat_mode='standard'
  invoice_prefix text,                           -- e.g. 'NP7E'
  invoice_footer text,
  terms_url     text,
  sicherungsschein_insurer text,
  sicherungsschein_number  text,
  updated_at    timestamptz not null default now()
);

-- ── Gapless invoice counter (per division + year) ──
create table if not exists invoice_counters (
  division    text not null,
  year        int  not null,
  last_number int  not null default 0,
  primary key (division, year)
);

create or replace function next_invoice_number(p_division text, p_year int)
returns int
language plpgsql
security definer
as $$
declare n int;
begin
  insert into invoice_counters (division, year, last_number)
       values (p_division, p_year, 1)
  on conflict (division, year)
       do update set last_number = invoice_counters.last_number + 1
    returning last_number into n;
  return n;
end;
$$;

-- ── Generated / stored documents ──
create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid references exp_bookings(id) on delete set null,
  contact_id     uuid references contacts(id)     on delete set null,
  division       text not null default 'experience',
  type           text not null,                  -- deposit_invoice|final_invoice|booking_confirmation|credit_note|sicherungsschein|other
  invoice_number text unique,
  title          text,
  file_path      text,                           -- key in the private 'documents' bucket
  amount         numeric,
  currency       text not null default 'EUR',
  status         text not null default 'issued', -- issued | void
  issued_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  meta           jsonb not null default '{}'::jsonb
);
create index if not exists idx_documents_booking on documents(booking_id);
create index if not exists idx_documents_contact on documents(contact_id);

-- ── Customer billing address (compliant buyer block) ──
alter table contacts
  add column if not exists billing_address     text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city        text,
  add column if not exists billing_country     text;

alter table company_settings enable row level security;
alter table invoice_counters enable row level security;
alter table documents        enable row level security;

drop policy if exists "company_settings team" on company_settings;
create policy "company_settings team" on company_settings for all using (is_team_member()) with check (is_team_member());
drop policy if exists "invoice_counters team" on invoice_counters;
create policy "invoice_counters team" on invoice_counters for all using (is_team_member()) with check (is_team_member());
drop policy if exists "documents team" on documents;
create policy "documents team" on documents for all using (is_team_member()) with check (is_team_member());

-- Seed empty profiles so the admin Settings form has rows to edit.
insert into company_settings (division, currency, vat_mode, invoice_prefix)
  values ('experience', 'EUR', 'margin', 'NP7E'), ('hardware', 'EUR', 'standard', 'NP7H')
on conflict (division) do nothing;
