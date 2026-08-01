-- A real on/off switch per email.
--
-- Until now there was exactly ONE switch for the whole pipeline
-- (EMAIL_LIFECYCLE_LIVE), so all 14 automated mails were on together or off
-- together. There was no way to say "everything except the countdown".
--
-- NOT to be confused with `active`, which sounds like a switch and isn't: it
-- only chooses between your custom wording and the built-in wording, and never
-- stops a mail sending. Kept as-is; the UI now labels it for what it does.
alter table email_templates
  add column if not exists enabled boolean not null default true;

comment on column email_templates.enabled is
  'Master on/off for THIS email. false = never sends, whatever the pipeline flag says. Distinct from `active`, which only picks custom vs built-in wording.';

-- The switch upserts by template_key (most automations have no row until
-- someone edits their wording), which needs a unique index to conflict on.
-- Two legacy rows carry a NULL key; Postgres treats NULLs as distinct, so they
-- coexist happily under a plain unique index.
create unique index if not exists email_templates_template_key_key
  on email_templates (template_key);
