-- Coaching graphics: the annotated photo, stored as a document.
--
-- The PLAN is the record and the exported PNG is a cache of it. A graphic has
-- to be re-openable in two years, and re-rendered after a brand tweak without
-- anyone drawing it again, which a flattened image cannot do.
--
-- The coach's own rough strokes are kept forever alongside it, because they are
-- the input the model was given: when a graphic comes out wrong, that is the
-- difference between diagnosing it and guessing again. Same reason for the
-- sentence he typed and for the provenance blob.

create table if not exists public.kb_graphics (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.kb_entries(id) on delete cascade,
  -- The source photo. Null = a graphic with nothing behind it.
  media_id uuid references public.kb_media(id) on delete set null,
  -- Which section it illustrates. Free text like kb_media.section_key and
  -- FK-less for the same reason: the section row may not exist yet.
  section_key text,
  title text,
  kind text not null default 'photo' check (kind in ('photo', 'video')),

  -- THE DOCUMENT. Shape = AnnotationPlan in src/lib/annotation-plan.ts.
  plan jsonb not null default '{}'::jsonb,
  -- Which version of the mark vocabulary `plan` was written against. The
  -- vocabulary will grow; without this a later widening has to guess.
  plan_version integer not null default 1,

  -- The coach's rough strokes, and the line he typed. The model's inputs.
  sketch jsonb not null default '[]'::jsonb,
  brief text,

  -- Model id, effort, prompt hash, which entry fields were fed in. Not
  -- decoration: when a graphic looks wrong this is the only way to know why.
  source jsonb not null default '{}'::jsonb,

  -- Regenerate-undo. [{ plan, brief, at }], newest last, capped in the route.
  history jsonb not null default '[]'::jsonb,

  -- Where the rendered PNG landed, once approved. A cache, never the record.
  export_key text,
  export_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_graphics_entry on public.kb_graphics (entry_id, section_key);
create index if not exists kb_graphics_media on public.kb_graphics (media_id) where media_id is not null;

alter table public.kb_graphics enable row level security;
-- Service role only, like every other knowledge table since migration 172.
