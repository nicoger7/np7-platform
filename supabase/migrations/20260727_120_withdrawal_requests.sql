-- Widerrufsfunktion (§ 356a BGB, in force 19 June 2026): consumer withdrawal
-- declarations submitted through the online withdrawal function at /widerruf.
-- The row IS the legal declaration — created_at is the statutory "date and time
-- of receipt" echoed in the acknowledgment email. Service-role access only.

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  contract_ref text not null,          -- order / voucher / booking number, or the purchase email
  email text not null,                 -- electronic address for the acknowledgment (§ 356a Abs. 2 Nr. 3)
  note text,                           -- optional free text (never a required field)
  status text not null default 'new' check (status in ('new', 'processed')),
  ack_sent_at timestamptz
);

alter table public.withdrawal_requests enable row level security;
-- Zero policies on purpose: only the service role (API routes) reads/writes.
