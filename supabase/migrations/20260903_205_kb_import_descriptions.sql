-- Bring the sentences we already wrote into the knowledge base.
--
-- Nico: "Some skills have that already, so catch up our data here."
-- level_milestones.description is what a member reads on the Progress page
-- today, so retyping it into the knowledge base would be work for nothing.
--
-- Only the ones that are actually a SENTENCE are imported, six words or more.
-- Of the 58 active skills, 11 have a description identical to the skill's own
-- name ("Back strap") and 17 are short labels ("Tack on intermediate gear").
-- Writing those into "One sentence" would mark the field done and silence the
-- question that asks for a real explanation, which is the opposite of what this
-- system is for. They stay empty and stay asked.
--
-- public_fields is seeded with one_liner: the sentence is already public on the
-- Progress page, so releasing it here changes nothing for members and keeps the
-- switch honest about what they see.

insert into public.kb_sections (entry_id, section_key, data, status, open_questions, public_fields, updated_at)
select k.id,
       'what',
       jsonb_build_object('one_liner', btrim(m.description)),
       'draft',
       -- looks_like is still required and still missing, so the section is a
       -- draft with exactly one question left, not complete.
       '["What does it look like when it is right? The picture coach and rider share."]'::jsonb,
       array['one_liner'],
       now()
  from public.kb_entries k
  join public.level_milestones m on m.id = k.milestone_id
 where m.description is not null
   and btrim(m.description) <> ''
   and lower(btrim(m.description)) <> lower(btrim(m.label))
   and array_length(regexp_split_to_array(btrim(m.description), '\s+'), 1) >= 6
on conflict (entry_id, section_key) do nothing;
