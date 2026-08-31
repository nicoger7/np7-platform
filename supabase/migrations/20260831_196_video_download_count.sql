-- Videos get the same "3 full downloads" cap the photos have (migration 024),
-- counted separately: a member burning their photo downloads shouldn't lose
-- their video ones, and vice versa. The API route reads this tolerantly, so
-- the button keeps working (uncapped) until this is applied.
alter table exp_bookings add column if not exists video_download_count int not null default 0;
