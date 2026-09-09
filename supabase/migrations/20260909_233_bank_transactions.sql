-- 233 · Real money: the bank/PSP ledger, and the link from a transaction to an invoice
--
-- Until now every row in exp_payments was TYPED BY A HUMAN — off Henny's and
-- Maite's Google Sheet, off a bank statement, off Stripe. That is why €6,210
-- got recorded twice (bank lines 229 and 233, entered by hand and imported
-- again) and why €31,911 sits in a pile with no booking: a hand-copied payment
-- has no identity of its own, so nothing can tell two copies of it apart.
--
-- bank_transactions is the opposite: one row per movement that ACTUALLY
-- happened, carrying the source's own id. It is imported, never authored. The
-- unique index on (source, external_id) is the whole point — re-running an
-- import is a no-op, and the same transaction cannot enter twice however many
-- times anyone syncs.
--
-- The two layers stay separate on purpose:
--   bank_transactions = what the bank says happened (fact, immutable, imported)
--   exp_payments      = what NP7 books against a booking (interpretation)
-- A transaction is MATCHED to a payment, which in turn answers to an invoice.
-- Keeping them apart is what lets a single transfer cover two invoices, and a
-- transaction that turns out not to be a guest payment be set aside without
-- deleting anything the bank said.
--
-- ⚠ THE DOUBLE-COUNT TRAP, designed against from the start: Stripe charges
-- arrive here individually AND arrive again in Qonto as one net payout a few
-- days later. Counting both would inflate revenue by the whole Stripe volume.
-- `kind` carries this: a Qonto credit from Stripe is 'payout' and is excluded
-- from the money-to-allocate pile, because the charges inside it are already
-- represented one by one. Same for fees and own-account transfers.

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),

  -- Which set of books. Mirrors documents.division rather than fin_entities,
  -- because that is what the rest of the money code is keyed on today.
  division text not null default 'experience',

  -- Where the row came from and what it is called THERE. Together unique.
  source text not null check (source in ('qonto', 'stripe', 'csv', 'manual')),
  external_id text not null,
  account_ref text,                       -- IBAN tail / Stripe account, for multi-account later

  -- When the money moved. booked_on drives every total; executed_at is kept
  -- because a card charge and its settlement are not the same instant.
  booked_on date not null,
  executed_at timestamptz,

  -- SIGNED: positive is money in, negative is money out. One column, so a sum
  -- over any selection is the net movement without a CASE.
  amount numeric(12,2) not null,
  currency text not null default 'EUR',

  -- What the bank knows about the other side. counterparty is the name as the
  -- bank spells it, which is rarely how the guest is spelt in contacts — the
  -- matcher's job, not the schema's.
  counterparty text,
  counterparty_iban text,
  reference text,                         -- Verwendungszweck / Stripe description
  label text,

  status text not null default 'completed' check (status in ('pending', 'completed', 'declined')),

  /*
   * What KIND of movement this is, which decides whether it belongs in the
   * pile of money waiting to be matched to an invoice:
   *   income   — a customer paid us. Match it.
   *   expense  — we paid someone. Belongs to costs, not invoices.
   *   payout   — a PSP settling its balance to the bank. Already counted as
   *              the individual charges; never match, never sum as revenue.
   *   fee      — the PSP's cut, or a bank charge.
   *   transfer — between our own accounts. Nets to zero across the group.
   *   unknown  — not classified yet; treated as income if positive.
   */
  kind text not null default 'unknown'
    check (kind in ('income', 'expense', 'payout', 'fee', 'transfer', 'unknown')),

  -- The bank's own payload, verbatim. Every importer stores it, so a matching
  -- rule invented later can be re-run over history without a re-sync.
  raw jsonb not null default '{}'::jsonb,

  -- The match. payment_id is the booked interpretation; document_id is the
  -- invoice it answers to, denormalised so the unmatched query stays one table.
  payment_id uuid references exp_payments(id) on delete set null,
  document_id uuid references documents(id) on delete set null,
  matched_at timestamptz,
  matched_by text,
  match_confidence text check (match_confidence in ('auto', 'suggested', 'manual')),

  -- Deliberately set aside: not a guest payment, or handled elsewhere. Never a
  -- delete — the bank said it happened, so the row stays and says why it is out.
  ignored_at timestamptz,
  ignored_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-running any import must be a no-op. This index is the guarantee.
create unique index if not exists bank_transactions_source_external
  on bank_transactions(source, external_id);

-- The three questions the page asks, in the order it asks them.
create index if not exists bank_transactions_unmatched
  on bank_transactions(booked_on desc)
  where payment_id is null and ignored_at is null;
create index if not exists bank_transactions_booked_on on bank_transactions(booked_on desc);
create index if not exists bank_transactions_payment on bank_transactions(payment_id);

-- The reverse link, so a payment can say which real movement produced it.
alter table exp_payments
  add column if not exists bank_transaction_id uuid
  references bank_transactions(id) on delete set null;
create index if not exists exp_payments_bank_transaction on exp_payments(bank_transaction_id);

create or replace function bank_transactions_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists bank_transactions_touch_trg on bank_transactions;
create trigger bank_transactions_touch_trg
  before update on bank_transactions
  for each row execute function bank_transactions_touch();

alter table bank_transactions enable row level security;
drop policy if exists bank_transactions_staff on bank_transactions;
create policy bank_transactions_staff on bank_transactions
  for all to authenticated
  using (exists (select 1 from team_members t where t.auth_user_id = auth.uid()))
  with check (exists (select 1 from team_members t where t.auth_user_id = auth.uid()));

comment on table bank_transactions is
  'Imported bank/PSP movements — one row per real transaction, deduped on (source, external_id). Matched to exp_payments; never hand-authored.';
