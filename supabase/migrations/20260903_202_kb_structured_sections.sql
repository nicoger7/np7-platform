-- Sections stop being one free textarea and become named fields.
--
-- Nico's call: "Each point like 'how to teach it' or 'drills' should follow a
-- specific structure, which is easy to understand by new coaches." The shape
-- was already written down, as English hints above the textarea
-- (kb-config.ts said drills are "setup · task · success criterion"), in the one
-- place nothing could enforce it. This moves it into the row.
--
-- Timing is deliberate: kb_sections is EMPTY in production. 58 entries were
-- seeded by migration 201 and nobody has typed into a section yet. There is no
-- markdown to convert, so nothing is parsed and nothing can be lost. The
-- one-way park below exists only for local and preview databases that picked
-- up test content: a regex that tried to split markdown into drills would
-- quietly mangle a coach's work, and guessing is the one thing this whole
-- change exists to remove.

alter table public.kb_sections
  -- The structured section. Shape per section_key, defined by KB_TEMPLATES.
  add column if not exists data jsonb not null default '{}'::jsonb,
  -- Which field set `data` was written against. The fields WILL change once
  -- coaches use this in anger; without it a later reshape has to guess.
  add column if not exists schema_version integer not null default 1,
  -- The section as it stood before the last assistant run, so one sort-in can
  -- be undone without undoing the coach's own edits.
  add column if not exists previous_data jsonb,
  -- Which fields of this section a HUMAN released to members. Seeded from the
  -- template's public defaults when the row is created, and only ever changed
  -- by a person: the assistant writes content, never visibility, so a
  -- braindump can't publish NP7's coaching method by accident.
  add column if not exists public_fields text[] not null default '{}';

-- Braindump lines the router could not place, kept so the assistant can never
-- drop a sentence in silence. [{ "text": "...", "at": "2026-09-03T..." }]
alter table public.kb_entries
  add column if not exists unsorted jsonb not null default '[]'::jsonb;

-- One-way park, never a parse. In production this matches zero rows.
update public.kb_sections
   set data = jsonb_build_object('legacy_notes', content)
 where coalesce(btrim(content), '') <> ''
   and data = '{}'::jsonb;

-- RLS unchanged: enabled on both tables since migration 172, still no
-- policies, so both stay service-role only. The new columns inherit that.
