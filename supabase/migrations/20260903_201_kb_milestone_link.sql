-- The knowledge base becomes the source of truth for skills, seeded from the
-- ladder that already exists.
--
-- Until now a kb_entries row found its skill through ref_key, a bare text
-- column with no foreign key and no uniqueness: two entries could claim the
-- same skill, and renaming or deleting a milestone orphaned the entry in
-- silence. Member progress does NOT hang on that key though, it hangs on the
-- milestone's id (contact_milestones.milestone_id, 1,095 rows across 51
-- members), so the id is the honest thing to point at. With this link a skill
-- can be renamed freely and nothing reaches for a key that moved.
--
-- ON DELETE RESTRICT, deliberately: deleting a knowledge entry must never be
-- able to take a milestone with it. A skill leaves the ladder by going
-- inactive, never by disappearing under the people who earned it.

alter table public.kb_entries
  add column if not exists milestone_id uuid references public.level_milestones(id) on delete restrict;

update public.kb_entries k
   set milestone_id = m.id
  from public.level_milestones m
 where m.key = k.ref_key
   and k.milestone_id is null;

create unique index if not exists kb_entries_milestone_uniq
  on public.kb_entries (milestone_id)
  where milestone_id is not null;

-- Seed: every ACTIVE skill on the ladder gets an entry to write into. Inactive
-- ones are left alone on purpose (14 in `windsurf`, 9 in `side` are switched
-- off, and whether they are dead weight or parked is Nico's call, not this
-- migration's).
insert into public.kb_entries (kind, ref_key, title, status, website_visible, sort_order, milestone_id)
select 'skill', m.key, m.label, 'draft', false, coalesce(m.sort_order, 0), m.id
  from public.level_milestones m
 where m.active
   and not exists (
     select 1 from public.kb_entries k
      where k.milestone_id = m.id or k.ref_key = m.key
   );
