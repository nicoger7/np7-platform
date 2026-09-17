-- 250 · Invoice a company, not just a person
--
-- Billing addresses arrive from Stripe checkout and print on the invoice, but a
-- guest whose employer or own company pays had nowhere to put the company's
-- name. A German invoice must carry the RECIPIENT's full name and address
-- (Sec 14 UStG), and for a business customer that is the company's legal name,
-- so the only workaround was to rename the contact or invoice a second contact
-- standing in for the company.
--
-- vat_id is the CUSTOMER's VAT number, kept for their records and for ours. It
-- changes no tax: NP7's trips run under the margin scheme (Sec 25 UStG), which
-- has applied to business customers too since 18 Dec 2019, so there is no
-- reverse charge and VAT is still not shown separately.
--
-- Additive, both nullable, no default, no backfill. Nothing to check first.

alter table public.contacts
  add column if not exists company_name text,
  add column if not exists vat_id text;

comment on column public.contacts.company_name is
  'Customer company. When set, the invoice is made out to this name with the person beneath it.';
comment on column public.contacts.vat_id is
  'The CUSTOMER''s VAT number. Printed for their records. Does not change the margin-scheme treatment.';

notify pgrst, 'reload schema';
