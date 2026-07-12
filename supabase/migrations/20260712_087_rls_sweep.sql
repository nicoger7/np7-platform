-- 087 · SECURITY: enable RLS on the remaining exposed tables
--
-- Follow-up to 072. A full anon INSERT probe across all 75 PostgREST-exposed
-- tables (2026-07-12) found these 11 still had RLS OFF — anyone with the public
-- anon key could INSERT/UPDATE/DELETE rows. Most critical: email_templates
-- (transactional email content could be rewritten → phishing injection).
--
-- Every consumer of these tables is a server-side API route using the service
-- role (which bypasses RLS), verified by code search — so zero policies is
-- correct: the anon key is locked out entirely, nothing legitimate breaks.
-- scenario_planner + sync_log have no code references at all (legacy).
--
-- Re-runnable (enable row level security is idempotent).

alter table edition_notes            enable row level security;
alter table email_templates          enable row level security;
alter table pipeline_rules           enable row level security;
alter table scenario_planner         enable row level security;
alter table spot_edit_confirms       enable row level security;
alter table spot_field_verifications enable row level security;
alter table spotguide_trust          enable row level security;
alter table staff_active_time        enable row level security;
alter table sync_log                 enable row level security;
alter table task_rules               enable row level security;
alter table todos                    enable row level security;
