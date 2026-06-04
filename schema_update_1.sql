-- Update: přidání schválení a platby hráčů
-- Spusť v Supabase SQL Editor

alter table public.profiles
  add column if not exists is_approved boolean default false,
  add column if not exists has_paid boolean default false;

-- Admin je automaticky schválený a zaplacený
update public.profiles
set is_approved = true, has_paid = true
where is_admin = true;

-- Uprav trigger aby admin byl automaticky schválený
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, is_approved, has_paid)
  values (
    new.id,
    split_part(new.email, '@', 1),
    false,  -- čeká na schválení
    false   -- čeká na platbu
  );
  return new;
end;
$$;

-- Aktualizuj leaderboard view aby zahrnoval platbu
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
  select user_id, (winner_points + finalist_points + scorer_points) as pre_pts
  from public.pre_tips
) pt on pt.user_id = p.id
where p.is_approved = true
group by p.id, p.display_name, p.avatar_emoji, p.is_approved, p.has_paid, pt.pre_pts
order by total_points desc;
