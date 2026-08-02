-- A guest landing at the airport wants one thing from the hotel block: where is
-- it. `location` is free text, so it can't be tapped. An explicit maps link can.
-- Optional: when it's empty the portal falls back to a Google Maps search built
-- from the hotel name + location, which is right often enough to be useful and
-- costs no data entry.
alter table hotels add column if not exists maps_url text;
comment on column hotels.maps_url is
  'Optional Google Maps (or any map) link shown to guests on their trip page.
   Leave empty and the portal builds a Maps search from name + location.';
