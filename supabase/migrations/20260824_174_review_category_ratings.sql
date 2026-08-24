-- Category ratings on guest reviews — jsonb map { key: 1..5 }.
-- Keys (coaching, vibe, offwater, food, accommodation, organization) live in
-- src/lib/review-categories.ts; the submit API whitelists + clamps on write.
-- NULL = the review predates categories (every review until 2026-08-24) —
-- every surface treats that as a complete, fine review.
alter table exp_reviews add column if not exists category_ratings jsonb;
