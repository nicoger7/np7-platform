-- ============================================================================
-- 147 — Two answers from Nico, written into the data.
--
-- Le Petit Morne is a VILLA NP7 rented for the Mauritius week, not a hotel we
-- hold rooms at. It stays in the partner list — a villa landlord has the same
-- cancellation exposure as a hotel, and more of it, since a whole-property
-- booking is rarely refundable late. It just has no row in `hotels`, and does
-- not need one: `hotels` is the product side that feeds room types and public
-- photos, and a one-off villa on a finished trip feeds neither.
--
-- Melanie is confirmed as the contact at Sorobon, so her standalone vendor row
-- is retired. Archived, not deleted: it reappears in /admin/archive and can be
-- restored, and the Notion id on it stays intact in case that sync ever wants
-- it back.
-- ============================================================================

update vendors
   set notes = coalesce(nullif(btrim(notes), '') || E'\n', '') ||
               'Villa NP7 rented for the Mauritius week — whole property, not a room allotment. Late cancellation on a villa is usually harder than on a hotel, so the terms matter more here, not less.'
 where name = 'Le Petit Morne'
   and archived_at is null
   and coalesce(notes, '') not like '%Villa NP7 rented%';

-- Her address already sits on the Sorobon row (migration 146), so nothing is
-- lost by retiring the duplicate relationship.
update vendors
   set archived_at = now()
 where name = 'Melanie'
   and archived_at is null
   and exists (
     select 1 from vendors s
      where s.name = 'Sorobon Beach Resort'
        and s.archived_at is null
        and s.email = 'melanie@sorobonbeachresort.com'
   );
