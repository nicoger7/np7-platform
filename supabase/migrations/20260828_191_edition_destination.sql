-- A clinic series does not have A destination.
--
-- "NP7 Coaching Clinics USA" runs at Hatteras in October and in the Columbia
-- River Gorge next September. The destination link lived on the EXPERIENCE, so
-- both runs pointed at Outer Banks: the Gorge page would have carried Hatteras'
-- intro, Hatteras' photo and Hatteras' wind climatology under a heading that
-- said Hood River. It has not shown yet only because that destination is still
-- a draft — the wrong page is one publish away.
--
-- So the run carries its own spot. Null keeps today's behaviour (fall back to
-- the experience), which is right for every trip and for a clinic that always
-- lands in the same place.
alter table exp_editions
  add column if not exists destination_id uuid references destinations(id) on delete set null;

comment on column exp_editions.destination_id is
  'The spot THIS run happens at. Overrides exp_experiences.destination_id; null = use the experience''s.';

create index if not exists exp_editions_destination_idx on exp_editions (destination_id);
