-- ============================================================================
-- 156 — A minor cannot sign their own contract.
--
-- The race clinic sells to Turkish youth and junior sailors alongside adults.
-- Under 18, the rider cannot validly enter a contract or waive anything
-- (§§104–113 BGB; Turkish law is equivalent) — a parent or guardian has to be
-- the contracting party. Without that the €400 sale is voidable and the waiver
-- is worth nothing, which is the opposite of protection.
--
-- So the booking records WHO rides and WHO is legally responsible, and the
-- waiver records who actually signed and in what capacity. Adults are
-- unaffected: guardian columns stay null and the rider signs for themself.
--
-- participant_dob is the fact everything derives from — age is computed against
-- the event date, never trusted from the browser.
-- ============================================================================

alter table exp_bookings add column if not exists participant_dob date;
alter table exp_bookings add column if not exists guardian_name text;
alter table exp_bookings add column if not exists guardian_email text;
alter table exp_bookings add column if not exists guardian_phone text;
alter table exp_bookings add column if not exists guardian_relationship text;

comment on column exp_bookings.participant_dob is
  'Date of birth of the person RIDING. Drives the minor check (age at the event date), which decides whether a guardian is legally required.';
comment on column exp_bookings.guardian_name is
  'Parent/guardian — the contracting party when the participant is under 18. Null for adults.';

-- The waiver has to say who signed and as what: a minor signing for themself is
-- not a waiver, and a guardian signing needs to be recorded as the guardian.
alter table exp_waiver_signatures add column if not exists signed_as text;      -- 'participant' | 'guardian'
alter table exp_waiver_signatures add column if not exists guardian_relationship text;

comment on column exp_waiver_signatures.signed_as is
  'participant = the rider signed for themself (adults). guardian = a parent/guardian signed on behalf of a minor.';
