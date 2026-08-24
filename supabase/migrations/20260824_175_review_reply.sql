-- NP7's public reply to a guest review — the owner's voice under the guest's.
-- One reply per review, shown on the trip page once the review is approved
-- (rides the same row, so the existing approved-only RLS covers it).
alter table exp_reviews add column if not exists reply text;
alter table exp_reviews add column if not exists replied_at timestamptz;
