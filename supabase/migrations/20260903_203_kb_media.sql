-- Photos and videos on a knowledge entry.
--
-- Nico: "instead of just uploading a media we should be able to choose one from
-- the media we already have. most likely memories will be used a lot here."
-- So this table does not store files. It POINTS at what R2 already holds: the
-- week's memories, the website library, the trip videos. A coaching entry that
-- shows the real photo of a real guest doing the thing is worth more than a
-- stock shot, and those photos are already paid for and already in the bucket.
--
-- `ref` is the stable handle, the same convention memory_stars uses, because
-- there is no catalogue table for memories or trip videos anywhere: the bucket
-- listing IS the catalogue. For a photo that is the storage path
-- (memories/{edition}/…); for a video it is the _video/ stem. `url` is stored
-- next to it so the editor renders without a second lookup, and so a moved
-- CDN base can be repaired by rewriting one column.
--
-- section_key is nullable on purpose: media attaches to a section today and to
-- a focus point later, and a null means "belongs to the entry as a whole"
-- rather than an orphan.

create table if not exists public.kb_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.kb_entries(id) on delete cascade,
  -- Which section it illustrates. Free text, matching KB_TEMPLATES, same as
  -- kb_sections.section_key: no FK, because the section row may not exist yet.
  section_key text,
  kind text not null check (kind in ('photo', 'video')),
  -- Storage path (photo) or _video/ stem (video). The handle that survives a
  -- CDN change; see memory_stars.ref for the same idea.
  ref text not null,
  url text not null,
  poster_url text,
  caption text,
  -- Where it came from, so the library can tell a guest's memory apart from a
  -- shot uploaded straight into the knowledge base.
  source text not null default 'library' check (source in ('library', 'memories', 'upload')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists kb_media_entry on public.kb_media (entry_id, section_key, sort_order);
-- The same photo twice on one section is a mistake, not a choice.
create unique index if not exists kb_media_unique on public.kb_media (entry_id, coalesce(section_key, ''), ref);

alter table public.kb_media enable row level security;
-- Service role only, exactly like kb_entries and kb_sections since migration
-- 172. Member reads arrive with the per-field release, not before.
