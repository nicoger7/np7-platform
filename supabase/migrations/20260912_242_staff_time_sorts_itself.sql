-- 242 · Staff time sorts itself, whichever letter case it arrives in
--
-- scripts/smoke-margin.mts asserts that every hours-log cost row carries a
-- § 25 bucket. On 2026-09-12 it failed, 14 of 15: "Labour — Simona
-- Alessandrí (2026-09)" had been written by the hours-cost cron AFTER
-- migration 237 ran its one-off backfill, so nothing ever sorted it. 237 said
-- the rule is true "by construction": staff time is bought from nobody, so
-- it can never be a Reisevorleistung. A rule that is true by construction
-- belongs in the row's construction, not in a one-off UPDATE. The guard
-- trigger of migration 240 now stamps it on the way in, so the cron, the
-- edition page and any script that has never heard of margin_class all
-- leave a hours-log row sorted.
--
-- The same rule, case-insensitively. 237 matched 'Overhead labour%' and
-- walked past 24 Notion-era rows spelled "Overhead Labour (2026-03)". They
-- are the one-off overhead run of 2026-06-08 (src/lib/hours-cost.ts tells
-- the story), staff time like the others, and go in the same bucket for the
-- same reason. None of the 24 carries an actual, so their provenance is
-- untouched.
--
-- What this means at the screen: a row whose item starts with "Labour" or
-- "Overhead labour" cannot be left UNSORTED; it can still be moved between
-- own_service and overhead by hand (a class that is set is never
-- overwritten). Which of those two it is does not change the margin, only
-- whether the trip price would have to be split, as 237 explains.
--
-- Additive and reversible. No amount changes. Rollback:
--   update exp_costs set margin_class = null, margin_class_note = null, margin_class_at = null
--    where margin_class_at >= '<the timestamp this ran>'
--      and margin_class_note in ('Administrative hours, classified automatically from the hours log',
--                                'NP7 staff hours on a trip, classified automatically from the hours log');
--   then re-create exp_costs_guard() from migration 240.

create or replace function exp_costs_guard() returns trigger
language plpgsql as $$
declare
  v_exp uuid;
begin
  -- 1. An edition cost carries its edition's experience (migration 240).
  if new.scope = 'edition' and new.edition_id is not null then
    select experience_id into v_exp from exp_editions where id = new.edition_id;
    if new.experience_id is null then
      new.experience_id := v_exp;
    elsif v_exp is not null and new.experience_id <> v_exp then
      raise exception 'exp_costs: edition % belongs to experience %, not %', new.edition_id, v_exp, new.experience_id
        using errcode = 'check_violation';
    end if;
  end if;

  -- 2. A typed actual carries a provenance; hours-log rows are off_bank
  --    with their note (migration 240, now case-insensitive).
  if new.actual_amount is null then
    new.actual_provenance := null;
  else
    if new.actual_provenance is null then
      new.actual_provenance := 'unverified';
    end if;
    if new.actual_provenance = 'unverified'
       and (new.item ilike 'Labour%' or new.item ilike 'Overhead labour%') then
      new.actual_provenance := 'off_bank';
      new.actual_note := coalesce(nullif(btrim(new.actual_note), ''),
        'Staff time from the hours log, valued at the hourly rate. Never a bank line of its own.');
    end if;
  end if;

  -- 3. A reason only means something off the edition (migration 240).
  if new.scope = 'edition' then
    new.scope_reason := null;
  end if;

  -- 4. Staff time sorts itself (this migration). Only when nobody has
  --    decided: a class that is set stays exactly as set.
  if new.margin_class is null then
    if new.item ilike 'Overhead labour%' then
      new.margin_class := 'overhead';
      new.margin_class_note := 'Administrative hours, classified automatically from the hours log';
      new.margin_class_at := now();
    elsif new.item ilike 'Labour%' then
      new.margin_class := 'own_service';
      new.margin_class_note := 'NP7 staff hours on a trip, classified automatically from the hours log';
      new.margin_class_at := now();
    end if;
  end if;

  return new;
end $$;

-- The trigger itself is unchanged from 240 and already points at this
-- function; re-created here so the file stands alone if 240 is ever replayed.
drop trigger if exists exp_costs_guard_trg on exp_costs;
create trigger exp_costs_guard_trg
  before insert or update on exp_costs
  for each row execute function exp_costs_guard();

-- ── backfill: the rows the one-off of 237 did not reach ─────────────────────

update exp_costs
   set margin_class = 'overhead',
       margin_class_note = 'Administrative hours, classified automatically from the hours log',
       margin_class_at = now()
 where margin_class is null
   and item ilike 'Overhead labour%';

update exp_costs
   set margin_class = 'own_service',
       margin_class_note = 'NP7 staff hours on a trip, classified automatically from the hours log',
       margin_class_at = now()
 where margin_class is null
   and item ilike 'Labour%';
