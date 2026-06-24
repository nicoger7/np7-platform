-- 060 · Physical rooms (exp_rooms) + per-week occupancy link
--
-- ADDITIVE normalization of hotel rooms. Until now exp_hotel_rooms held ONE ROW
-- PER ROOM × WEEK, so a physical Bonaire/Sorobon/Wanapa room appeared 3× (one per
-- edition). This splits the model WITHOUT dropping columns or deleting rows
-- (exp_hotel_rooms has notion_id → Notion-sync rules require additive-only):
--
--   * NEW  exp_rooms        = the physical room (one per experience + hotel + name).
--   * exp_hotel_rooms       = the per-WEEK occupancy (all columns unchanged) + a new
--                             room_id FK pointing at its physical room.
--
-- Edition / booking / destinations views keep reading occupancy by
-- edition_id / booking_id / hotel — untouched. Re-runnable (guards throughout).

-- 1) physical room ─────────────────────────────────────────────────────────────
create table if not exists exp_rooms (
  id            uuid primary key default gen_random_uuid(),
  experience_id uuid references exp_experiences(id) on delete set null,
  hotel         text,
  name          text not null,
  room_type     text,
  room_number   text,
  comments      text,
  notion_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists exp_rooms_experience_idx on exp_rooms(experience_id);

comment on table exp_rooms is
  'A physical hotel room (one per experience+hotel+name). Its weekly occupancy lives in exp_hotel_rooms (room_id).';

-- 2) occupancy → physical link ─────────────────────────────────────────────────
alter table exp_hotel_rooms
  add column if not exists room_id uuid references exp_rooms(id) on delete set null;
create index if not exists exp_hotel_rooms_room_idx on exp_hotel_rooms(room_id);

comment on column exp_hotel_rooms.room_id is
  'The physical room (exp_rooms) this weekly occupancy belongs to. exp_hotel_rooms is now per room×week.';

-- 3) backfill (re-runnable: 3a guarded by NOT EXISTS, 3b by room_id is null) ────
-- 3a) one physical room per distinct (experience_id, hotel, name), from the
--     earliest-created ACTIVE occupancy row (carries its room_type/number/notes).
insert into exp_rooms (experience_id, hotel, name, room_type, room_number, comments, notion_id)
select distinct on (o.experience_id, o.hotel, o.name)
       o.experience_id, o.hotel, o.name, o.room_type, o.room_number, o.comments, o.notion_id
from exp_hotel_rooms o
where o.archived_at is null
  and not exists (
    select 1 from exp_rooms r
    where r.name = o.name
      and r.hotel is not distinct from o.hotel
      and r.experience_id is not distinct from o.experience_id
  )
order by o.experience_id, o.hotel, o.name, o.created_at;

-- 3b) link every (still-unlinked) occupancy row to its physical room.
update exp_hotel_rooms o
set room_id = r.id
from exp_rooms r
where o.room_id is null
  and r.name = o.name
  and r.hotel is not distinct from o.hotel
  and r.experience_id is not distinct from o.experience_id;
