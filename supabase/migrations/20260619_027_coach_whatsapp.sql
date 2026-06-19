-- 20260619_027_coach_whatsapp.sql
-- Additive-only. A WhatsApp chat link per team member (e.g. the trip assistant),
-- so participants can message them directly from My Trip → Your team.
alter table exp_coaches add column if not exists whatsapp_link text;
