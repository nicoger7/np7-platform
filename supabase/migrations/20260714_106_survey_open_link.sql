-- Open (shareable) survey link: one stable token per survey. Anyone with the
-- link leaves name + email and gets their own personal invite — so responses
-- stay per-person and the admin list shows who came in through the link.
alter table exp_surveys
  add column if not exists open_token text unique;

-- Where an invite came from: null/'admin' = hand-picked, 'open_link' = they
-- self-registered via the shared link (excluded from "Send invites").
alter table exp_survey_invites
  add column if not exists source text;

-- Every existing survey gets its link immediately.
update exp_surveys
  set open_token = 'join-' || substr(md5(gen_random_uuid()::text), 1, 14)
  where open_token is null;
