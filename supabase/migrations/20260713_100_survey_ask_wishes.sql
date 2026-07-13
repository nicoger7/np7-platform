-- Optional "What are you looking for in this trip?" free-text card on the
-- classic survey form — relevant for premium trips, noise for others.
-- true (default) = shown, false = hidden (progress bar adapts).
alter table exp_surveys add column if not exists ask_wishes boolean not null default true;
