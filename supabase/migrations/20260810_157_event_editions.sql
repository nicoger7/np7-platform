-- ============================================================================
-- 157 — An event date IS an edition.
--
-- Events were given their own light shape (exp_event_dates) so a ticket could
-- be sold fast. The cost showed up the moment one sold: no edition means no
-- Finance income, no capacity panel, no "who booked" — and, worse, a paying
-- customer's trip page had no dates and invented a €300 deposit plan they
-- never agreed to, because every member surface reads the edition.
--
-- So the edition learns what page_template already knows on the content side:
-- kind='event' is a 1–2 day clinic, kind='trip' is a week. One shape, and
-- every edition-keyed feature works for both.
--
-- Additive and reversible: exp_event_dates is kept, and each migrated booking
-- records the date row it came from.
-- ============================================================================

alter table exp_editions add column if not exists kind text not null default 'trip'
  check (kind in ('trip', 'event'));

-- An event edition sells its own ticket. These live on exp_experiences today,
-- which is exactly why one experience could only ever host one clinic.
alter table exp_editions add column if not exists price numeric;
alter table exp_editions add column if not exists event_mode text;            -- 'fixed' | 'standby'
alter table exp_editions add column if not exists event_deposit_pct int;
alter table exp_editions add column if not exists event_refund_pct int;

alter table exp_bookings add column if not exists migrated_from_event_date uuid;

comment on column exp_editions.kind is
  'trip = a week-long experience edition. event = a 1–2 day clinic sold as a ticket; the member area and admin hide trip-only surfaces (arrival, prep, payment plan) for these.';

-- ── Backfill: one edition per existing event date ───────────────────────────
insert into exp_editions (experience_id, kind, label, date_start, date_end, max_spots,
                          price, event_mode, event_deposit_pct, event_refund_pct,
                          status, year, currency)
select d.experience_id, 'event', d.label, d.date_start, d.date_end, d.max_spots,
       x.price, x.event_mode, x.event_deposit_pct, x.event_refund_pct,
       case when d.status = 'cancelled' then 'draft' else 'published' end,
       extract(year from d.date_start)::int, x.currency
from exp_event_dates d
join exp_experiences x on x.id = d.experience_id
where not exists (
  select 1 from exp_editions e
   where e.experience_id = d.experience_id and e.kind = 'event' and e.date_start = d.date_start
);

-- ── Point existing event bookings at their new edition ──────────────────────
update exp_bookings b
   set edition_id = e.id,
       migrated_from_event_date = d.id,
       updated_at = now()
  from exp_event_dates d
  join exp_editions e
    on e.experience_id = d.experience_id and e.kind = 'event' and e.date_start = d.date_start
 where d.id = any(b.event_date_ids)
   and b.edition_id is null;
