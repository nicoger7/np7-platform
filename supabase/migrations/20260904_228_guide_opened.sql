-- When the rider actually read their focus points.
--
-- A guide lands days after the trip, unannounced, at the bottom of a tab. The
-- member home is about to lead with it while it is new and settle it into a
-- quiet list once it has been read, and "has been read" is not something the
-- browser can be trusted to remember: a rider who opens the guide on the phone
-- on the way home and then looks on a laptop would be told it is new again.
--
-- Null means never opened. Set once, by the owner opening their own guide, and
-- never by an admin previewing the portal as them.

alter table public.windcoach_guides
  add column if not exists opened_at timestamptz;

comment on column public.windcoach_guides.opened_at is
  'First time the owning member opened this guide. Null = unread. Not set by admin preview.';

-- The home page asks "does this member have an unread guide" on every load.
create index if not exists windcoach_guides_contact_unread_idx
  on public.windcoach_guides (contact_id)
  where status = 'stored' and opened_at is null;
