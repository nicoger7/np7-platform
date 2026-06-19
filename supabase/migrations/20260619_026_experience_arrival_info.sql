-- 20260619_026_experience_arrival_info.sql
-- Additive-only. Arrival/transport info shown to members in Trip prep:
--   airport_distance  — e.g. "≈ 30 min / 25 km from the airport"
--   transport_options — how to get from the airport, e.g.
--                       {"Airport transfer","Taxi","Rental car (recommended)"}
-- (Airport code already exists on exp_experiences.airport_code.)
alter table exp_experiences add column if not exists airport_distance  text;
alter table exp_experiences add column if not exists transport_options text[] default '{}';
