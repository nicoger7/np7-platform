-- 141 · Let jibe propose edits to an existing spot instead of duplicating it.
--
-- The intake only ever INSERTS a spot: paste new notes about a place already in
-- the guide and you get a second copy of it. The machinery to do it properly
-- already exists — spot_edits is the member "propose one field, others confirm"
-- flow — but jibe could not use it, because contact_id was NOT NULL and jibe is
-- not a person.
--
--   contact_id nullable — a machine proposal has no member behind it
--   source              — 'member' (unchanged behaviour) or 'jibe'
--
-- A jibe edit deliberately does NOT ride the member confirm-to-publish ladder:
-- three riders agreeing that another rider is right is a different claim from
-- three riders agreeing a model is right. Nico reviews these himself.
alter table spot_edits alter column contact_id drop not null;
alter table spot_edits add column if not exists source text not null default 'member';
create index if not exists spot_edits_source_idx on spot_edits (source, status);
