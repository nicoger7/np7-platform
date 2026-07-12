-- Store the template variables with each email_log row so the admin log can
-- re-render a faithful preview of what was actually sent (hover preview).
-- account_magic_link vars are never stored (they contain the login token).
alter table email_log add column if not exists vars jsonb;
