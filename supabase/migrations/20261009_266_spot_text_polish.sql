-- jibe Job E: polish a member spot's summary/description into NP7's voice.
-- text_polished_at marks a spot as done (idempotency); member_text keeps the
-- member's own words, untouched, so nothing they wrote is ever lost.
alter table spots
  add column if not exists text_polished_at timestamptz,
  add column if not exists member_text      jsonb;   -- { summary, description } as the member wrote them

notify pgrst, 'reload schema';
