# Events as editions — the restructure

*Written 2026-08-10, to run AFTER the Alaçatı race clinic (14–15 Aug) is done.
Not before: moving the data model under a live sales page four days out is how
you lose a weekend of ticket sales.*

---

## Why

An event is an `exp_experiences` row with `page_template='event'` and its dates
in `exp_event_dates` — a deliberately light alternative to editions. That was the
right call for "sell a ticket fast". It has two costs that grow:

1. **Everything edition-keyed is blind to events.** The Finance tab (Costs /
   Income / Net), the capacity panel, arrivals, hotel rooms, level caps — all
   join on `edition_id`, which an event booking doesn't have. Nico's own words:
   *"I don't see who booked it."* The bookings exist in `/admin/bookings`, but no
   edition view collects them, and €4,800 of ticket revenue never appears in any
   P&L.
2. **One experience per weekend clinic.** Each clinic adds a permanent row to the
   experiences list, the Components experience filter, the Packages filter, every
   picker. A clinic a month makes those lists unusable inside a year.

The fix is not to teach every feature about events. It is to stop having two
shapes: **an event date IS an edition**.

---

## The target shape

```
exp_experiences   "NP7 Race Clinics"        ← ONE row, page_template='event'
  └ exp_editions  kind='event'
        · 14–15 Aug 2026 · Alaçatı · €400 · 12 spots
        · 12–13 Sep 2026 · Alaçatı · €400 · 12 spots
        · …                                  ← clinic #7 = duplicate an edition
```

Everything follows for free: the edition switcher, the bookings tab, the Finance
tab, the capacity panel, `Duplicate edition`. Adding a clinic becomes the thing
the platform is already good at.

---

## Migration (157)

```sql
-- an edition can be a 1–2 day event, not just a week
alter table exp_editions add column if not exists kind text not null default 'trip'
  check (kind in ('trip','event'));
-- an event edition carries its own ticket price + Stripe terms (today these sit
-- on the experience, which is why one experience can only ever sell one event)
alter table exp_editions add column if not exists price numeric;
alter table exp_editions add column if not exists event_mode text;           -- 'fixed' | 'standby'
alter table exp_editions add column if not exists event_deposit_pct int;
alter table exp_editions add column if not exists event_refund_pct int;
-- keep the old link so nothing is lost during the cutover
alter table exp_bookings add column if not exists migrated_from_event_date uuid;
```

`exp_event_dates` is **not dropped** — it stays as the historical record until the
cutover is verified in production, then becomes a view or is retired in a later
migration. Additive only, per the house rule.

## Code changes, smallest first

| # | Change | File(s) | Size |
|---|---|---|---|
| 1 | `getEventForSlug` reads editions where `kind='event'` instead of `exp_event_dates`; price falls back experience → edition | `src/lib/events.ts` | S |
| 2 | Checkout writes `edition_id` (not just `event_date_ids`); capacity check uses `exp_edition_pool` instead of the hand-rolled count | `src/app/api/event/checkout/route.ts` | S |
| 3 | Webhook unchanged — it already keys on `booking_id` | — | — |
| 4 | Event page picks the edition to sell (soonest upcoming published), so one experience can host many clinics | `src/components/experience/event-page.tsx` | M |
| 5 | Admin: edition detail shows event fields when `kind='event'` (price, mode, deposit/refund %) and hides trip-only tabs | `src/app/admin/editions/[id]/page.tsx` | M |
| 6 | Experiences list + pickers: group `page_template='event'` rows under one "Clinics & events" heading | list pages | S |
| 7 | Backfill: create one edition per existing `exp_event_dates` row, copy dates/label/max_spots, point existing bookings at it | one-off script | S |

## Backfill (one clinic today, so it's small)

```sql
-- 1 edition per event date, inheriting the experience's ticket terms
insert into exp_editions (experience_id, kind, label, date_start, date_end,
                          max_spots, price, event_mode, event_deposit_pct,
                          event_refund_pct, status, year)
select d.experience_id, 'event', d.label, d.date_start, d.date_end, d.max_spots,
       x.price, x.event_mode, x.event_deposit_pct, x.event_refund_pct,
       case when d.status = 'cancelled' then 'draft' else 'published' end,
       extract(year from d.date_start)
from exp_event_dates d join exp_experiences x on x.id = d.experience_id;

-- point the bookings at their new edition (event_date_ids is a uuid[])
update exp_bookings b set edition_id = e.id, migrated_from_event_date = d.id
from exp_event_dates d join exp_editions e
  on e.experience_id = d.experience_id and e.date_start = d.date_start and e.kind = 'event'
where d.id = any(b.event_date_ids) and b.edition_id is null;
```

**Verify before trusting it:** every event booking has an `edition_id`; the
Finance tab shows the clinic's income; the capacity panel matches tickets sold;
the public page still sells. Only then retire `exp_event_dates`.

## What this unlocks the day it lands

- The clinic appears in **Finance → Income** (12 × €400) and in **Net**
- **Who booked** is visible in the edition's Bookings tab, like every trip
- Capacity comes from `exp_edition_pool` — one definition, not a bespoke check
- Clinic #2 = **Duplicate edition**, thirty seconds, no new experience row
- Arrivals and level caps work for clinics if you ever want them

## Risk

Low, and reversible: additive columns, `exp_event_dates` kept, and
`migrated_from_event_date` records where every booking came from. The only live
surface that changes is the event page's date lookup — verifiable on the staging
URL before it touches production.
