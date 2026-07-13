-- Survey reminder round: when the "Remind non-responders" button re-mailed an
-- invite. One reminder per invite (the send skips anyone already reminded);
-- shown in the admin invite list.
alter table exp_survey_invites
  add column if not exists reminded_at timestamptz;
