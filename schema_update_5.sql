-- Podpora pro ET zápasy (prodloužení bez penalt)
-- is_et_win = true → home_score/away_score je 90min výsledek (pro body)
--                   penalty_home_score/penalty_away_score je ET výsledek (pro bracket)
alter table public.matches add column if not exists is_et_win boolean default false;
