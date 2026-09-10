-- 237 · Which costs reduce the margin, and which only look like they do
--
-- § 25 taxes the margin, not the turnover: the trip price minus what NP7 bought
-- in from other people FOR THAT TRIP. So a cost line's classification is not a
-- reporting nicety, it moves the VAT directly. Put a guest's hotel in the wrong
-- bucket and the margin, and the tax on it, are wrong by that amount.
--
-- Three buckets, and only the first one is subtracted:
--
--   travel_input  Reisevorleistung. Bought from a third party and delivered
--                 straight to the guest: hotel, the guests' flights and
--                 transfers, food, the windsurf centre, gear rental, excursions,
--                 self-employed coaches bought in. Reduces the margin, so less
--                 tax. Booked GROSS, because § 25 Abs. 4 Satz 1 forbids the
--                 input-tax deduction even on a German invoice showing 19%:
--                 that VAT is not money back from the tax office, it is part of
--                 the cost and belongs inside the margin.
--
--   own_service   Eigenleistung. NP7 doing it itself, above all coaching by its
--                 own coaches. Does NOT reduce the margin and is taxed normally,
--                 which means the trip price would have to be split. Whether
--                 the coaches are employed or invoice as freelancers is the
--                 largest question still open with the tax practice, and it
--                 decides whether an own service exists at all, so rows land
--                 here to be counted, not to be treated as settled.
--
--   overhead      Gemeinkosten. Belongs to no single trip: office, software,
--                 admin, marketing, the accountant. Stays out of the margin
--                 entirely.
--
-- NULL means nobody has decided yet, and that is the honest default for most of
-- these rows. The accounting plan already names the size of the job: 243 cost
-- lines with no such distinction, of which the administrative hours classify
-- themselves and the rest need an hour at the screen with Nico. An unclassified
-- line is NOT quietly treated as overhead, because a travel input left out
-- makes the margin, and the tax on it, too big. The § 25 record reports the
-- unclassified pile as its own figure and refuses to call a trip final while
-- anything is in it.
--
-- The auto-classification below is deliberately narrow. It touches only the
-- rows src/lib/hours-cost.ts synthesises from hours_log × team_members.rate_per_hour,
-- and it asserts one thing about them that is true by construction: staff time
-- was not bought from a third party, so it cannot be a Reisevorleistung
-- whatever else it turns out to be. Which of the two remaining buckets it lands
-- in does not change the margin, only whether the price has to be split, so
-- getting that half of it wrong costs nothing today and is visible and editable
-- when the practice rules on the coaches.

alter table exp_costs
  add column if not exists margin_class text
    check (margin_class in ('travel_input', 'own_service', 'overhead')),
  add column if not exists margin_class_note text,
  add column if not exists margin_class_at timestamptz;

comment on column exp_costs.margin_class is
  '§ 25 bucket: travel_input reduces the margin, own_service and overhead do not. NULL = not yet decided, and never assumed.';

create index if not exists exp_costs_margin_class_idx on exp_costs (margin_class);

-- Own staff time. Bought from nobody, so never a Reisevorleistung.
-- 'Overhead labour — …' is administration and 'Labour — …' / 'Labour (experience) — …'
-- is work on a trip; both are NP7's own hands. The item strings are written by
-- hours-cost.ts, which also matches on them when topping a row up.
update exp_costs
   set margin_class = 'overhead',
       margin_class_note = 'Administrative hours, classified automatically from the hours log',
       margin_class_at = now()
 where margin_class is null
   and item like 'Overhead labour%';

update exp_costs
   set margin_class = 'own_service',
       margin_class_note = 'NP7 staff hours on a trip, classified automatically from the hours log',
       margin_class_at = now()
 where margin_class is null
   and item like 'Labour%';
