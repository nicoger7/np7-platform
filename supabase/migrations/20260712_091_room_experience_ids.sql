-- Rooms can serve SEVERAL experiences (e.g. one hotel hosting two programs).
-- experience_ids is the new source of truth; experience_id stays as the first
-- entry for back-compat with older filters.
alter table exp_rooms add column if not exists experience_ids uuid[] not null default '{}';
update exp_rooms set experience_ids = array[experience_id]
  where experience_id is not null and (experience_ids is null or experience_ids = '{}');
