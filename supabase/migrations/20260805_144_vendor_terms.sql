-- ============================================================================
-- 144 — What did we actually agree with this supplier?
--
-- §651h(3) BGB: when unavoidable extraordinary circumstances at the destination
-- significantly impair a trip, the guest cancels free and we refund everything.
-- That duty is ours and it is not waivable. What IS negotiable is whether the
-- hotel then keeps our room money — and if it does, the whole refund comes out
-- of NP7.
--
-- So the exposure is not in the law, it is in each supplier contract, and it is
-- per supplier. Two numbers decide it: how late we can cancel rooms for free,
-- and whether their force-majeure clause mirrors ours. Neither was written down
-- anywhere, which means the answer lived in whoever last spoke to the hotel.
-- ============================================================================

alter table vendors
  add column if not exists cancel_free_until_days int,
  add column if not exists force_majeure_mirrored boolean,
  add column if not exists terms_status           text,
  add column if not exists terms_note             text,
  add column if not exists terms_checked_at       date;

do $$ begin
  alter table vendors add constraint vendors_terms_status_check
    check (terms_status is null or terms_status in ('todo','requested','agreed','refused'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table vendors add constraint vendors_cancel_free_days_check
    check (cancel_free_until_days is null or cancel_free_until_days between 0 and 400);
exception when duplicate_object then null; end $$;

comment on column vendors.cancel_free_until_days is
  'We can cancel rooms/services with them free of charge until this many days
   before arrival. 0 = free right up to arrival. NULL = nobody has asked. This
   is the number that decides how much of a trip NP7 is exposed on.';
comment on column vendors.force_majeure_mirrored is
  'TRUE when their terms release us on the same grounds §651h(3) BGB releases
   our guests — i.e. the force-majeure risk is back-to-back rather than ours
   alone. NULL = not asked, FALSE = asked and they refused (a real answer worth
   recording: it prices the trip).';
comment on column vendors.terms_status is
  'Where the negotiation stands: todo / requested / agreed / refused.';
comment on column vendors.terms_note is
  'What was actually agreed, in their words — clause numbers, who said it, any
   deadline. The contract is the source of truth; this is the pointer to it.';
comment on column vendors.terms_checked_at is
  'When we last confirmed this is still what the contract says. Hotel contracts
   are renegotiated per season, so an old date is itself a finding.';
