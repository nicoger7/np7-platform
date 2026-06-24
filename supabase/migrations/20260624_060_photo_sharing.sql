-- 060 · Opt-in photo sharing between trip participants
--
-- A participant can let the OTHER people on their trip see their personal photos
-- (memories/{editionId}/p/{bookingId}/) in the shared trip gallery. Default ON —
-- most people are happy to share their week's shots. When OFF, their personal
-- photos stay visible only to themselves.
--
-- The member's OWN photos always lead their gallery; then the week's "Everyone"
-- shots; then the personal photos of other participants who left sharing on.
-- The home-banner slideshow and avatar picker keep showing only the member's own
-- photos (they don't pull the group pool).
--
-- Additive + re-runnable.

alter table exp_bookings
  add column if not exists photos_shared boolean not null default true;

comment on column exp_bookings.photos_shared is
  'Member opt-in: show this booking''s personal trip photos to the other participants on the same edition (default true). The member always sees their own regardless.';
