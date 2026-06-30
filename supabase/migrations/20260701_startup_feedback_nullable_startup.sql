-- General feedback (e.g. from the leaderboard page) isn't tied to one company.
alter table public.startup_feedback alter column startup_id drop not null;
