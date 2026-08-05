-- ============================================================================
-- 146 — Jibe City, and Melanie is a person not a supplier.
--
-- 145 added the two centers Nico named. Bonaire's was missing: Jibe City at
-- Sorobon Bay is where all three Bonaire weeks are actually run, and we book
-- gear and space there ahead of the season — the same exposure as a hotel.
--
-- "Melanie" was a vendor row in her own right, imported from Notion with the
-- address melanie@sorobonbeachresort.com. She is the contact AT Sorobon, not a
-- supplier: a partner list that reads Sorobon Beach Resort and Melanie as two
-- relationships will collect two half-answers about the same contract. Her
-- address moves onto the Sorobon row where a contact belongs, and her own row
-- is pointed at the same hotel so the two read as one. Nothing is deleted —
-- whether that row is retired is Nico's call, not a migration's.
-- ============================================================================

insert into vendors (name, category, terms_status, notes)
select 'Jibe City', array['center']::text[], 'todo',
       'Bonaire — Sorobon Bay. Gear, launch and coaching base for all three Bonaire weeks. Check the cancellation terms.'
 where not exists (
   select 1 from vendors v where v.archived_at is null and lower(v.name) = 'jibe city'
 );

update vendors set email = 'melanie@sorobonbeachresort.com',
                   notes = coalesce(nullif(btrim(notes), ''), '') ||
                           case when coalesce(notes, '') = '' then '' else E'\n' end ||
                           'Contact: Melanie.'
 where name = 'Sorobon Beach Resort' and archived_at is null
   and (email is null or email = '');

update vendors v set hotel_id = h.id
  from hotels h
 where v.name = 'Melanie' and v.hotel_id is null
   and h.name = 'Sorobon Beach Resort' and h.archived_at is null;
