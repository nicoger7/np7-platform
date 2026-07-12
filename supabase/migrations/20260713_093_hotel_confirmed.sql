-- Hotel-confirmed flag on room week-rows.
--
-- Overlapping stays are sometimes fine: the hotel may cover the clash from
-- rooms outside our allotment. Instead of treating every overlap as an error,
-- the team can mark a stay as "hotel confirmed" (internal only — confirming
-- the add-on to the CUSTOMER also sets this; setting this never notifies the
-- customer). Overlap warnings soften once either side is confirmed.
-- Editing a row's check-in/out resets the flag (the hotel OK'd the old dates).

alter table exp_hotel_rooms
  add column if not exists hotel_confirmed boolean not null default false,
  add column if not exists hotel_confirmed_at timestamptz;
