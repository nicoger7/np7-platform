-- 232 · Consent to use a guest's likeness in NP7 marketing
--
-- Distinct from photos_shared (migration 060). That one is about the CREW:
-- may the other participants on your trip see your shots. This one is about the
-- PUBLIC: may NP7 put your face on its website, its social accounts and its paid
-- ads. Same photos, completely different audience, so it needs its own consent.
--
-- Legal shape, not a convenience flag:
--   · Opt-IN. Default is no consent. Never pre-ticked (GDPR Art. 4(11): freely
--     given, and Art. 7(2): distinguishable from the other terms).
--   · Provable. Art. 7(1) requires the controller to demonstrate consent, which
--     means WHEN it was given and TO WHAT — hence the timestamp and the stored
--     wording, not a bare boolean. If the wording later changes, old rows keep
--     the text their owner actually agreed to.
--   · Revocable, and the withdrawal is dated (Art. 7(3)). We keep the original
--     grant date rather than nulling it: a campaign that ran while consent stood
--     was lawful, and we have to be able to show that afterwards.
--   · § 22 KUG (Recht am eigenen Bild) points the same way for German guests.
--
-- may_use_in_marketing is generated, so nothing can set it out of step with the
-- dates it derives from. That is the column the ad tooling reads.
--
-- Additive + re-runnable.

alter table exp_bookings
  add column if not exists marketing_consent_at timestamptz;

alter table exp_bookings
  add column if not exists marketing_consent_withdrawn_at timestamptz;

alter table exp_bookings
  add column if not exists marketing_consent_text text;

alter table exp_bookings
  add column if not exists may_use_in_marketing boolean
  generated always as (
    marketing_consent_at is not null and marketing_consent_withdrawn_at is null
  ) stored;

comment on column exp_bookings.marketing_consent_at is
  'When this guest agreed that NP7 may use their likeness publicly (website, social, paid ads). Null = never agreed. Kept even after withdrawal, as proof that material published before the withdrawal date was covered.';

comment on column exp_bookings.marketing_consent_withdrawn_at is
  'When the guest took that permission back. Consent is revocable at any time (GDPR Art. 7(3)); withdrawal is not retroactive.';

comment on column exp_bookings.marketing_consent_text is
  'The exact wording the guest agreed to. Consent only covers what it described, so the text is stored per booking and survives later edits to the live copy.';

comment on column exp_bookings.may_use_in_marketing is
  'Derived: consent given and not withdrawn. The flag the ad tooling checks before a face goes into a campaign. Generated — never write it directly.';

-- Finding cleared guests for a campaign is a filtered scan over a mostly-false
-- column; index only the true rows.
create index if not exists exp_bookings_marketing_ok_idx
  on exp_bookings (edition_id)
  where may_use_in_marketing;
