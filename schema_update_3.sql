-- Oprava leaderboard view: přidej goals_team_points a cards_points do pre_pts
drop view if exists public.leaderboard;
create view public.leaderboard as
select
  p.id,
  p.display_name,
  p.avatar_emoji,
  p.is_approved,
  p.has_paid,
  coalesce(sum(t.points), 0) + coalesce(sum(st.scorer_pts), 0) + coalesce(pt.pre_pts, 0) as total_points,
  count(distinct t.match_id) as tips_count,
  count(distinct case when t.home_score = m.home_score and t.away_score = m.away_score then t.id end) as exact_scores
from public.profiles p
left join public.tips t on t.user_id = p.id
left join public.matches m on m.id = t.match_id
left join (
  select user_id, sum(points) as scorer_pts
  from public.scorer_tips group by user_id
) st on st.user_id = p.id
left join (
  select user_id,
    (winner_points + finalist_points + scorer_points + goals_team_points + cards_points) as pre_pts
  from public.pre_tips
) pt on pt.user_id = p.id
where p.is_approved = true
group by p.id, p.display_name, p.avatar_emoji, p.is_approved, p.has_paid, pt.pre_pts
order by total_points desc;
