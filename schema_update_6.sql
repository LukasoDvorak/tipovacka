-- Ochrana ručně přidaných gólů před přepsáním syncí
alter table public.goals add column if not exists is_manual boolean default false;
