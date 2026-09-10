-- 236 · lexoffice: which company's books a document belongs in, and whether it got there
--
-- NP7 stays the issuer of its own invoices. That was tested and decided, not
-- assumed: lexoffice's sales-invoice endpoints answer 406, its down-payment
-- endpoints 404, and creating an invoice there would make lexoffice assign its
-- own number and end the gapless NP7-XP series. What DOES work is
-- POST /v1/vouchers, and it accepts OUR voucherNumber verbatim (probed against
-- the live account on 2026-09-10). So an NP7 invoice is pushed as a Beleg
-- carrying its own number, with its PDF attached, and lexoffice is the
-- Belegarchiv and the Bankbuch. It is not the thing that computes the tax:
-- the vendor states plainly that Lexware Office cannot represent margin
-- taxation, and § 25 has neither a category nor a tax key there.
--
-- Two things this migration exists to make possible.
--
-- ONE, IDEMPOTENCE. lexoffice accepts a duplicate voucherNumber without a
-- murmur, has no DELETE for a voucher, and rejects any voucherStatus on
-- update, so a voucher that should not exist can only be removed by hand in
-- the browser. The id has to be written down the moment a push succeeds, and
-- the unique index below is what makes a second push of the same document a
-- database error rather than a phone call to the bookkeeper.
--
-- TWO, MORE THAN ONE COMPANY. One lexoffice account is one company. On
-- 2027-01-01 NP7 Experience GmbH takes over with its own account, its own key
-- and its own numbering circle, and a correction to a 2026 invoice must still
-- come from the old GmbH. So a document is routed by ITS OWN issue date
-- against an account's validity window, never by which company happens to be
-- current when someone presses the button. fin_lexoffice_accounts is that
-- window. The API key itself is not in here and never will be: only the NAME
-- of the environment variable that holds it, so a key lives where secrets
-- live and rotating one is a deploy, not an UPDATE.

-- ─── Where a place sits in the EU VAT territory ──────────────────────────────
--
-- DRITTLAND or EU decides whether the margin on a trip is tax free (§ 25 Abs. 2)
-- or taxable the month the money arrives, and the two questions the political
-- map answers are not the questions VAT asks. Tenerife is Spain and the Canary
-- Islands are outside the EU VAT territory. Bonaire is Dutch and outside it
-- too. Norway is in the EEA and is still a third country.
--
-- src/lib/lexoffice/territory.ts derives this and abstains with UNKLAR wherever
-- it has not been told. This column is where the tax practice's actual ruling
-- gets recorded, and it always wins over the derivation. NULL means nobody has
-- ruled and the derived answer stands.
alter table destinations
  add column if not exists vat_territory text
    check (vat_territory in ('third_country', 'eu', 'unclear'));

comment on column destinations.vat_territory is
  'Tax practice ruling on the EU VAT territory. Overrides the derivation in lexoffice/territory.ts. NULL = not ruled, use the derived value.';

-- ─── One lexoffice account, for one company, for one stretch of time ─────────

create table if not exists fin_lexoffice_accounts (
  id uuid primary key default gen_random_uuid(),

  entity_id uuid not null references fin_entities(id) on delete cascade,
  label text not null,

  -- The lexoffice organizationId. Checked against GET /v1/profile before
  -- anything is written, so a key pasted into the wrong company's slot is
  -- caught before it puts a guest invoice in the wrong set of books.
  org_id text,

  -- The NAME of the env var holding the key, e.g. 'LEXOFFICE_API_KEY'.
  -- Never the key.
  env_key text not null,

  -- The numbering-circle era this account owns. Half-open: valid_from is
  -- inclusive, valid_to is inclusive, and NULL on either side means open.
  -- A document is routed by its own issued_at, which is what keeps a 2027
  -- correction to a 2026 invoice in the 2026 company.
  valid_from date,
  valid_to date,

  -- lexoffice has 231 fixed categories and allows no custom ones, so the
  -- choice is made once with the tax practice and then never varied: the
  -- practice can reclassify a whole year in one move only if every row agrees.
  -- Left NULL until that decision exists, and a push refuses to run without it
  -- rather than picking something plausible.
  sales_category_id text,
  credit_category_id text,

  -- Off by default. Turning this on is the act of saying "these books are
  -- ready to receive real documents".
  enabled boolean not null default false,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fin_lexoffice_accounts_entity_idx
  on fin_lexoffice_accounts (entity_id, valid_from);

alter table fin_lexoffice_accounts enable row level security;
drop policy if exists fin_lexoffice_accounts_staff on fin_lexoffice_accounts;
create policy fin_lexoffice_accounts_staff on fin_lexoffice_accounts
  for all to authenticated
  using (exists (select 1 from team_members t where t.auth_user_id = auth.uid()))
  with check (exists (select 1 from team_members t where t.auth_user_id = auth.uid()));

comment on table fin_lexoffice_accounts is
  'One lexoffice account = one company for one stretch of time. Routes a document to a set of books by the document''s own issue date. Holds the NAME of the env var with the API key, never the key.';

-- ─── What happened to this document in lexoffice ─────────────────────────────

alter table documents
  add column if not exists lexoffice_voucher_id text,
  add column if not exists lexoffice_account_id uuid references fin_lexoffice_accounts(id),
  add column if not exists lexoffice_pushed_at timestamptz,
  -- The Beschreibung as it was actually sent. This is not a log line: it is the
  -- only place in lexoffice where a booking entry can be tied to a single trip,
  -- which § 25 has required per trip since 01.01.2022. Keeping our copy means
  -- the margin record can be rebuilt without reading it back out of lexoffice.
  add column if not exists lexoffice_remark text,
  add column if not exists lexoffice_error text,
  add column if not exists lexoffice_attempts integer not null default 0;

-- A voucher id may stand against exactly one document. If a bug ever tried to
-- record the same voucher twice this fails loudly instead of quietly implying
-- two invoices were booked when one was.
create unique index if not exists documents_lexoffice_voucher_uidx
  on documents (lexoffice_voucher_id)
  where lexoffice_voucher_id is not null;

-- The admin's pending list is "issued, billable, never pushed", so it reads
-- this index rather than scanning every document ever generated.
create index if not exists documents_lexoffice_pending_idx
  on documents (issued_at)
  where lexoffice_voucher_id is null and status = 'issued';

comment on column documents.lexoffice_voucher_id is
  'The lexoffice voucher this document was pushed as. Set = pushed; the unique index makes a second push impossible.';

-- ─── Seed: the account that exists today ─────────────────────────────────────
--
-- NP7 GmbH, org bcfd62da-3766-4cc6-b1d4-e9993102238f, reading LEXOFFICE_API_KEY.
-- valid_to is 2026-12-31 because the Experience business moves to its own
-- company on 01.01.2027 and will get its own row, its own key and its own
-- numbering circle. Left disabled and without categories: the accounting plan
-- has "welche lexoffice-Kategorie fuer Reiserechnungen" standing open as a
-- question for the tax practice, and a push refuses to guess it.
insert into fin_lexoffice_accounts (entity_id, label, org_id, env_key, valid_from, valid_to, enabled, note)
select e.id,
       'NP7 GmbH',
       'bcfd62da-3766-4cc6-b1d4-e9993102238f',
       'LEXOFFICE_API_KEY',
       null,
       '2026-12-31',
       false,
       'Books the Experience trips until 31.12.2026. Categories still to be set with the tax practice.'
from fin_entities e
where e.key = 'np7-experience'
  and not exists (select 1 from fin_lexoffice_accounts a where a.entity_id = e.id);
