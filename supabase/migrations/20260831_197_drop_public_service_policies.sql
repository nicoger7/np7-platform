-- 197 · SECURITY: drop the "service role" policies that were actually PUBLIC
--
-- The 2026-08-31 re-probe after applying 087 found six tables still accepting
-- anon INSERTs despite RLS being enabled. Cause: each carries a
-- `service_all_<table>` policy written as "the service role may do everything"
-- — but the service role BYPASSES RLS entirely, so the policy's only effect
-- was its role grant, and that grant was `public`: every command, open to
-- anyone holding the anon key. The `auth_read_*` twins gave any logged-in
-- member SELECT on internal admin tables (email templates included).
--
-- Every consumer of these tables is a server-side service-role route
-- (code-verified in the 087 sweep), so zero policies is the correct end state:
-- anon and authenticated are locked out, service-role routes are unaffected.
--
-- Re-runnable (drop policy if exists).

drop policy if exists service_all_email_templates  on email_templates;
drop policy if exists auth_read_email_templates    on email_templates;
drop policy if exists service_all_pipeline_rules   on pipeline_rules;
drop policy if exists auth_read_pipeline_rules     on pipeline_rules;
drop policy if exists service_all_scenario_planner on scenario_planner;
drop policy if exists auth_read_scenario_planner   on scenario_planner;
drop policy if exists service_all_sync_log         on sync_log;
drop policy if exists auth_read_sync_log           on sync_log;
drop policy if exists service_all_task_rules       on task_rules;
drop policy if exists auth_read_task_rules         on task_rules;
drop policy if exists service_all_todos            on todos;
drop policy if exists auth_read_todos              on todos;
