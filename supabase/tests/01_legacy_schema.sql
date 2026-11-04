-- LOCAL TEST ONLY: plausible pre-existing (legacy) tables with permissive policies and 2 existing users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'old1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'old2@example.com');
create table public.profiles (id uuid primary key references auth.users(id), email text, created_at timestamptz default now());
create table public.wallets (id uuid primary key default gen_random_uuid(), user_id uuid, balance numeric default 0);
create table public.wallet_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null, amount numeric, type text, created_at timestamptz default now());
create table public.tasks (id uuid primary key default gen_random_uuid(), title text not null);
create table public.task_completions (id uuid primary key default gen_random_uuid(), user_id uuid not null, task_id uuid not null references public.tasks(id));
create table public.provider_events (id uuid primary key default gen_random_uuid());
create table public.referrals (id uuid primary key default gen_random_uuid());
create table public.withdrawal_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table public.tokenhub_test (id serial primary key, note text);
insert into public.profiles (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'old1@example.com');
insert into public.wallets (user_id, balance) values ('00000000-0000-0000-0000-0000000000a1', 0);
alter table public.wallets enable row level security;
create policy "allow all" on public.wallets for all using (true) with check (true);
