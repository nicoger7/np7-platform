-- Adults-only runs stop asking everybody their date of birth.
--
-- The date picker is not there to know your age; it is there to find out
-- whether the participant is under 18, because a minor cannot validly sign the
-- waiver or enter the contract — a guardian has to, and we need to be able to
-- reach them. You cannot know who is a minor without asking, so the form asks
-- everyone and reveals the guardian block only when it is needed.
--
-- On a run that does not accept juniors at all, that whole question is dead
-- weight: a date picker on every adult to catch a case that cannot occur. This
-- switch replaces it with a single "18 or over" confirmation, which keeps the
-- legal position (the buyer asserts capacity) at a fraction of the friction.
--
-- Per RUN, not per series: one clinic can take juniors while another does not.
-- Default false, so every existing edition keeps asking exactly as before.
alter table exp_editions
  add column if not exists adults_only boolean not null default false;

comment on column exp_editions.adults_only is
  'This run does not accept under-18s. The ticket form then asks for a single 18+ confirmation instead of a date of birth, and the guardian block never applies. False = ask for the date of birth (the default, and what every trip does).';
