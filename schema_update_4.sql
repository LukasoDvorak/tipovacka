-- Bracket struktura + penalty skóre pro playoff
alter table public.matches add column if not exists penalty_home_score int;
alter table public.matches add column if not exists penalty_away_score int;
alter table public.matches add column if not exists home_source_id text;
alter table public.matches add column if not exists away_source_id text;
alter table public.matches add column if not exists home_source_type text; -- 'winner' nebo 'loser'
alter table public.matches add column if not exists away_source_type text;
