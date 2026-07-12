-- Accommodation components link the actual hotel + room type instead of
-- retyping them in the name (offered automatically when category=accommodation).
alter table exp_components add column if not exists hotel_id uuid references hotels(id) on delete set null;
alter table exp_components add column if not exists room_type text;
