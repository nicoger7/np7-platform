-- ============================================================================
-- 200 — Someone else pays: an invoice can name a different person.
--
-- A trip invoice has always been addressed to the booking's own contact. That
-- is right when the traveller books for themselves, and wrong for every case
-- where they did not: a birthday present, a parent paying for a grown child,
-- a company sending an employee. Charlotte Baerenz booked Bonaire Week III for
-- her husband Uwe and needs the invoice in HER name — the platform had no way
-- to produce it.
--
-- Two columns, because they answer two different questions.
--
--   exp_bookings.billing_contact_id — a standing fact about the booking: this
--   trip is invoiced to that person. Every document generated from it follows.
--
--   documents.bill_to_contact_id — who a document WAS addressed to, stamped at
--   issue. A §14 UStG invoice states a recipient; changing who pays next month
--   must not silently rewrite an invoice that has already gone out.
--
-- Both nullable, and null means exactly what it has always meant: the traveller
-- is the customer. Nothing existing changes.
-- ============================================================================

alter table exp_bookings
  add column if not exists billing_contact_id uuid references contacts(id) on delete set null;

create index if not exists idx_bookings_billing_contact
  on exp_bookings(billing_contact_id) where billing_contact_id is not null;

comment on column exp_bookings.billing_contact_id is
  'Who this booking is invoiced to, when that is not the traveller (Anmelder / gift buyer / employer). Null = the traveller pays for themselves.';

alter table documents
  add column if not exists bill_to_contact_id uuid references contacts(id) on delete set null;

comment on column documents.bill_to_contact_id is
  'The contact this document was addressed to, stamped when it was issued. Null = the booking''s own contact, which is the ordinary case.';
