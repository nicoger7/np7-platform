-- 053: Gift voucher v2 — value vouchers + optional "Nico calls the recipient".
-- Additive only.
--   • A voucher can be for a specific experience OR "any experience" (value voucher)
--     — experience_id is already nullable, so no change needed there. Amount is now a
--     chosen value (slider), not tied to a package price.
--   • Optional gift extra: Nico personally calls the recipient with the news. The
--     buyer can add a phone + preferred date; the team actions the call.

alter table gift_vouchers add column if not exists nico_call          boolean not null default false;
alter table gift_vouchers add column if not exists recipient_phone    text;
alter table gift_vouchers add column if not exists call_preferred_date text;
