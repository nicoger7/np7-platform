-- Rooms named their hotel in free text ("REF", "REF II", "Sorobon") while the
-- hotels table held the real records ("REF Carsi", "REF Koyici", "Sorobon Beach
-- Resort"). Two unconnected lists that happened to use similar words: not one of
-- the 70 rooms matched a hotel, so a room could never tell you which hotel it
-- was in. REF was genuinely ambiguous — two REF hotels, one label.
alter table exp_hotel_rooms
  add column if not exists hotel_id uuid references hotels(id) on delete set null;

create index if not exists idx_exp_hotel_rooms_hotel_id on exp_hotel_rooms(hotel_id);

comment on column exp_hotel_rooms.hotel_id is
  'The real hotel this room belongs to. The legacy `hotel` text column is kept
   (Notion sync still writes it) but nothing should read it for identity.';

-- Backfill. The REF mapping is Nico''s: REF = Carsi, REF II = Koyici.
update exp_hotel_rooms r set hotel_id = h.id
from hotels h
where r.hotel_id is null and h.archived_at is null and (
      (r.hotel = 'Sorobon'        and h.name = 'Sorobon Beach Resort')
   or (r.hotel = 'Wanapa'         and h.name = 'Boutique Hotel Wanapa')
   or (r.hotel = 'Hotel Paradiso' and h.name = 'Hotel Paradiso Conca D''Oro')
   or (r.hotel = 'REF'            and h.name = 'REF Carsi')
   or (r.hotel = 'REF II'         and h.name = 'REF Koyici')
);
