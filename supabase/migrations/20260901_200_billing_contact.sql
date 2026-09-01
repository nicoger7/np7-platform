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
-- ── NO FOREIGN KEY, DELIBERATELY ────────────────────────────────────────────
--
-- Both columns reference a contact and neither declares a REFERENCES clause.
-- That is not an oversight; the first cut of this migration had them, and it
-- took production down within a minute of deploying.
--
-- PostgREST resolves an embed like `exp_bookings?select=contacts(name,email)`
-- through the foreign keys between the two tables. Adding a SECOND key from
-- exp_bookings to contacts makes that embed ambiguous, and PostgREST answers
-- 300 Multiple Choices rather than guess. Around thirty query sites use the
-- short form — the bookings list, the mail cron, the invoice generator, the
-- hotel-rooms view, the member portal — and every one of them broke at once.
--
-- The fix on the day was to drop both constraints and reload the schema cache.
-- Referential integrity for these two columns therefore lives in the
-- application: invoiceRecipient() in lib/invoices/generate.ts THROWS when the
-- billing contact cannot be found, rather than quietly addressing the invoice
-- to the traveller instead — a wrong invoice issued silently is worse than a
-- failed one.
--
-- To reinstate the keys later, every `contacts(...)` embed on these two tables
-- has to be disambiguated first (`contacts!contact_id(...)`). That is a
-- worthwhile tidy-up, but it is a separate change with its own testing.
-- ============================================================================

alter table exp_bookings
  add column if not exists billing_contact_id uuid;

create index if not exists idx_bookings_billing_contact
  on exp_bookings(billing_contact_id) where billing_contact_id is not null;

comment on column exp_bookings.billing_contact_id is
  'contacts.id of whoever this booking is invoiced to, when that is not the traveller (Anmelder / gift buyer / employer). Null = the traveller pays for themselves. Intentionally NOT a foreign key — see the migration header.';

alter table documents
  add column if not exists bill_to_contact_id uuid;

comment on column documents.bill_to_contact_id is
  'contacts.id this document was addressed to, stamped when it was issued. Null = the booking''s own contact, the ordinary case. Intentionally NOT a foreign key — see the migration header.';

-- The embeds above are resolved from cached schema, so a re-run that changes
-- keys must tell PostgREST to look again.
notify pgrst, 'reload schema';
