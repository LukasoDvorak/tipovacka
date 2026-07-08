-- Oprava recalc_points: playoff přesný výsledek = 7b (ne 5b)
-- Základní část: přesný = 5b, správný směr = 2b
-- Playoff (r32, r16, qf, sf, third, final): přesný = 7b, správný směr = 2b

create or replace function public.recalc_points()
returns text
language plpgsql
security definer
as $$
begin
  -- Aktualizuj body za tipy na výsledky
  update public.tips t
  set points = case
    when m.home_score = t.home_score and m.away_score = t.away_score then
      case when m.phase in ('r32','r16','qf','sf','third','final') then 7 else 5 end
    when (m.home_score > m.away_score and t.home_score > t.away_score) or
         (m.home_score < m.away_score and t.home_score < t.away_score) or
         (m.home_score = m.away_score and t.home_score = t.away_score) then 2
    else 0
  end
  from public.matches m
  where m.id = t.match_id
    and m.status = 'done'
    and m.home_score is not null
    and m.away_score is not null;

  -- Aktualizuj body za střelce (WHERE přes join)
  update public.scorer_tips st
  set points = case
    when exists (
      select 1 from public.goals g
      where g.match_id = st.match_id
        and lower(g.player_name) = lower(st.player_name)
    ) then 3
    else 0
  end
  where st.match_id in (select id from public.matches where status = 'done');

  return 'ok';
end;
$$;
