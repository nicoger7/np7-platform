-- The braindump becomes a conversation.
--
-- Nico: "make the AI chat interactive per skill - so it should answer back with
-- followup questions or questions about open topics from below".
--
-- Until now it was one shot: dump, sort, done, and the open questions sat
-- silently under each section where a coach had to go hunting for them. A
-- thread turns that around: the assistant says what landed and asks the next
-- thing, the coach answers in the same box, and the entry fills itself one
-- question at a time.
--
-- Stored on the entry so a reload does not lose the thread, and capped in the
-- route rather than here: this is a working conversation, not an archive.
-- [{ "role": "coach" | "assistant", "text": "...", "at": "..." }]
alter table public.kb_entries
  add column if not exists chat jsonb not null default '[]'::jsonb;
