-- 226 · A person can be on the team before they have a login
--
-- team_members.email was NOT NULL, so somebody who has been hired but not yet
-- given an address could not be recorded at all. That is backwards: the team is
-- a fact about the company, and the mailbox is a detail that follows.
--
-- Nothing downstream assumes an address exists. The invite route already
-- refuses with "This team member has no email to invite", and the three places
-- that match a signed-in user to a member do it BY address, so a null simply
-- never matches, which is exactly right for someone who cannot sign in yet.
alter table team_members alter column email drop not null;

comment on column team_members.email is
  'Null until they have one. Required to invite or to sign in; not required to exist.';
