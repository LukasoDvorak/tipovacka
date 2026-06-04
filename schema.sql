-- ══════════════════════════════════════════
--  Tipovačka MS 2026 · Supabase schema
-- ══════════════════════════════════════════

-- Uživatelské profily (rozšíření auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  avatar_emoji text default '😀',
  is_admin boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Profily vidí všichni" on public.profiles for select using (true);
create policy "Vlastní profil může editovat jen majitel" on public.profiles for update using (auth.uid() = id);

-- Trigger: automaticky vytvoří profil při registraci
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Zápasy (plní se z API nebo ručně adminem)
create table public.matches (
  id text primary key, -- např. 'bra-arg'
  home_team text not null,
  away_team text not null,
  home_flag text,
  away_flag text,
  group_name text,
  kickoff_at timestamptz not null,
  status text default 'scheduled', -- scheduled | live | finished
  home_score int,
  away_score int,
  phase text default 'group', -- group | r16 | qf | sf | final
  api_match_id int, -- football-data.org ID
  created_at timestamptz default now()
);
alter table public.matches enable row level security;
create policy "Zápasy vidí všichni" on public.matches for select using (true);
create policy "Zápasy může měnit jen admin" on public.matches for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Střelci gólů
create table public.goals (
  id bigserial primary key,
  match_id text references public.matches on delete cascade,
  player_name text not null,
  team text not null,
  minute int,
  created_at timestamptz default now()
);
alter table public.goals enable row level security;
create policy "Góly vidí všichni" on public.goals for select using (true);
create policy "Góly může měnit jen admin" on public.goals for all using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Tipy na výsledky zápasů
create table public.tips (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  match_id text references public.matches on delete cascade,
  home_score int not null,
  away_score int not null,
  points int default 0, -- přepočítá se po zápase
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, match_id)
);
alter table public.tips enable row level security;
-- Vlastní tip vždy vidím
create policy "Vlastní tipy vždy vidím" on public.tips for select using (auth.uid() = user_id);
-- Cizí tipy vidím jen po uzavření (1h před kickoff)
create policy "Cizí tipy po uzavření" on public.tips for select using (
  auth.uid() != user_id and
  exists (
    select 1 from public.matches m
    where m.id = match_id
    and m.kickoff_at <= now() + interval '1 hour'
  )
);
create policy "Tip může přidat přihlášený" on public.tips for insert with check (auth.uid() = user_id);
create policy "Tip může měnit jen majitel před uzavřením" on public.tips for update using (
  auth.uid() = user_id and
  exists (
    select 1 from public.matches m
    where m.id = match_id
    and m.kickoff_at > now() + interval '1 hour'
  )
);

-- Tipy na střelce
create table public.scorer_tips (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  match_id text references public.matches on delete cascade,
  player_name text not null,
  points int default 0,
  created_at timestamptz default now(),
  unique(user_id, match_id, player_name)
);
alter table public.scorer_tips enable row level security;
create policy "Vlastní scorer tipy vždy vidím" on public.scorer_tips for select using (auth.uid() = user_id);
create policy "Cizí scorer tipy po uzavření" on public.scorer_tips for select using (
  auth.uid() != user_id and
  exists (
    select 1 from public.matches m
    where m.id = match_id
    and m.kickoff_at <= now() + interval '1 hour'
  )
);
create policy "Scorer tip může přidat přihlášený" on public.scorer_tips for insert with check (auth.uid() = user_id);
create policy "Scorer tip může měnit jen majitel před uzavřením" on public.scorer_tips for update using (
  auth.uid() = user_id and
  exists (
    select 1 from public.matches m
    where m.id = match_id
    and m.kickoff_at > now() + interval '1 hour'
  )
);

-- Předturnajové tipy (1 per user)
create table public.pre_tips (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade unique,
  winner_team text,
  finalist_team text,
  top_scorer text,
  winner_points int default 0,
  finalist_points int default 0,
  scorer_points int default 0,
  locked_at timestamptz,
  created_at timestamptz default now()
);
alter table public.pre_tips enable row level security;
create policy "Vlastní předtip vždy vidím" on public.pre_tips for select using (auth.uid() = user_id);
create policy "Cizí předtipy po uzavření turnaje" on public.pre_tips for select using (
  auth.uid() != user_id and locked_at is not null
);
create policy "Předtip může přidat přihlášený" on public.pre_tips for insert with check (auth.uid() = user_id);
create policy "Předtip může měnit jen majitel před uzavřením" on public.pre_tips for update using (
  auth.uid() = user_id and locked_at is null
);

-- Push notifikace subscriptions
create table public.push_subscriptions (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id)
);
alter table public.push_subscriptions enable row level security;
create policy "Push sub vidí jen majitel" on public.push_subscriptions for all using (auth.uid() = user_id);

-- View: celkové body per hráč (pro leaderboard)
create view public.leaderboard as
select
  p.id,
  p.display_name,
  p.avatar_emoji,
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
group by p.id, p.display_name, p.avatar_emoji, pt.pre_pts
order by total_points desc;
