-- Bonus skills: visible in the catalog, tickable by a coach, worth a smile —
-- and worth NOTHING toward rank, tier derivation, or any progress counter.
alter table level_milestones add column if not exists bonus boolean not null default false;

insert into level_milestones (key, label, description, tier, rank, discipline, difficulty, sort_order, active, bonus)
select 'ex_handstand_friends_board',
       'Handstand on your friend''s board',
       'Bonus skill — style points only. Best performed while they''re watching. Does not count toward your rank (but absolutely counts toward the evening''s stories).',
       'Amateur', 'Expert', 'side', 42, 9990, true, true
where not exists (select 1 from level_milestones where key = 'ex_handstand_friends_board');
