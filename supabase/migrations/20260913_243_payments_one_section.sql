-- 243 · Bank and payments are one thing
--
-- Nico, 2026-09-13: "bank and payments are one thing basically. From now on
-- payments can pretty much only be via the bank (with that little back-door)."
--
-- Two things follow for the database.
--
-- ONE  The admin had two sections, `bank` (the imported feed) and `payments`
--      (rows people typed). They are one page now, keyed `payments`, and a
--      role that was granted the feed must keep the feed. So a stored role
--      carrying `sections.bank` has it folded into `sections.payments`, the
--      higher level winning, and the old key removed. On 2026-09-13 no stored
--      role carried it (Admin, NP7 Experience Media and NP7 Performance Team
--      all grant by other keys; Owner/Manager are computed live), so this
--      changes nothing today and protects a role saved in the gap before
--      deploy. normalizeAccess() in src/lib/access.ts applies the same fold on
--      read, for a row that somehow escapes.
--
-- TWO  A payment that claims to be bank-backed must name the movement it came
--      from. Migration 235 introduced `provenance = 'bank'` as "born from a
--      real bank_transactions row"; nothing in the schema held it to that, so
--      an UPDATE that set the label without the link would have produced the
--      exact thing the label exists to rule out: a figure that looks provable
--      and is not. The check closes that. The converse is deliberately NOT
--      enforced: a linked row may still read `unverified` for the moment
--      between an adoption and its label, and the backfill below is what
--      brings it in line.
--
-- The backfill re-runs 235's own statement. It is idempotent and touches one
-- row today: Minna Mäntynen's €6,650, matched by hand on 2026-09-10 from an
-- earlier version of the matcher that wrote the link and our own
-- `qonto:<id>` reference but predated the provenance column. Label only; no
-- amount, date, booking or invoice moves.

update team_roles
   set access = jsonb_set(
         access #- '{sections,bank}',
         '{sections,payments}',
         to_jsonb(
           case
             when access->'sections'->>'bank' = 'edit' or access->'sections'->>'payments' = 'edit' then 'edit'
             when access->'sections'->>'bank' = 'view' or access->'sections'->>'payments' = 'view' then 'view'
             else coalesce(access->'sections'->>'payments', access->'sections'->>'bank', 'none')
           end
         )
       )
 where access->'sections' ? 'bank';

update exp_payments set provenance = 'bank'
 where bank_transaction_id is not null and provenance <> 'bank';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exp_payments_bank_needs_transaction') then
    alter table exp_payments
      add constraint exp_payments_bank_needs_transaction
      check (provenance <> 'bank' or bank_transaction_id is not null);
  end if;
end $$;

comment on constraint exp_payments_bank_needs_transaction on exp_payments is
  'A payment labelled bank must name the bank_transactions row it was created from or adopted onto (migration 243).';
