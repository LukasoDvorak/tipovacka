-- Žádosti o přístup (nová tabulka)
create table if not exists public.access_requests (
  id bigserial primary key,
  name text not null,
  email text not null,
  status text default 'pending', -- pending | approved | rejected
  created_at timestamptz default now()
);
alter table public.access_requests enable row level security;

-- Kdokoli může podat žádost (nepřihlášený)
create policy "Kdokoli může podat žádost" on public.access_requests
  for insert with check (true);

-- Jen admin vidí žádosti
create policy "Jen admin vidí žádosti" on public.access_requests
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Jen admin může měnit status
create policy "Jen admin může měnit žádosti" on public.access_requests
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
