-- =====================================================================
-- TOKENHUB — complete backend: schema alignment, RLS, secure functions
-- Idempotent and additive: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- It NEVER drops tables or columns and NEVER deletes rows.
-- It DOES replace existing RLS policies on the TOKENHUB tables (see section 2)
-- and revokes direct table privileges from anon/authenticated (section 3).
-- REVIEW BEFORE APPLYING. Run supabase/inspect_schema.sql first.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function pg_temp.ensure_constraint(p_table regclass, p_name text, p_ddl text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conname = p_name and conrelid = p_table) then
    execute format('alter table %s add constraint %I %s', p_table, p_name, p_ddl);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Schema (existing tables are extended, never rebuilt)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.profiles
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists email text,
  add column if not exists username text,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles (id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);
select pg_temp.ensure_constraint('public.profiles', 'profiles_username_len',
  'check (username is null or char_length(username) between 2 and 40) not valid');

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.wallets
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists balance bigint not null default 0,
  add column if not exists lifetime_earned bigint not null default 0,
  add column if not exists lifetime_spent bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists wallets_user_id_key on public.wallets (user_id);
select pg_temp.ensure_constraint('public.wallets', 'wallets_balance_non_negative',
  'check (balance >= 0) not valid');

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.wallet_transactions
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists type text,
  add column if not exists amount bigint,
  add column if not exists balance_after bigint,
  add column if not exists status text default 'completed',
  add column if not exists description text,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists wallet_transactions_idem_key on public.wallet_transactions (idempotency_key);
create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions (user_id, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  created_at timestamptz not null default now()
);
alter table public.tasks
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists description text,
  add column if not exists task_type text not null default 'offer',
  add column if not exists reward bigint not null default 0,
  add column if not exists provider text,
  add column if not exists action_url text,
  add column if not exists is_active boolean not null default true,
  add column if not exists max_completions_per_user integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();
select pg_temp.ensure_constraint('public.tasks', 'tasks_reward_non_negative', 'check (reward >= 0) not valid');
select pg_temp.ensure_constraint('public.tasks', 'tasks_max_completions_positive', 'check (max_completions_per_user >= 1) not valid');

create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.task_completions
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists task_id uuid references public.tasks (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists status text not null default 'started',
  add column if not exists reward_amount bigint,
  add column if not exists click_id uuid not null default gen_random_uuid(),
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;
create unique index if not exists task_completions_click_id_key on public.task_completions (click_id);
create index if not exists task_completions_user_idx on public.task_completions (user_id, task_id);
select pg_temp.ensure_constraint('public.task_completions', 'task_completions_status_check',
  $c$check (status in ('started','completed','rejected','expired')) not valid$c$);

create table if not exists public.provider_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now()
);
alter table public.provider_events
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists provider text,
  add column if not exists event_id text,
  add column if not exists event_type text,
  add column if not exists click_id uuid,
  add column if not exists user_id uuid,
  add column if not exists task_id uuid,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'received',
  add column if not exists error text,
  add column if not exists processed_at timestamptz;
create unique index if not exists provider_events_provider_event_key on public.provider_events (provider, event_id);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.referrals
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists referrer_id uuid references auth.users (id) on delete cascade,
  add column if not exists referred_id uuid references auth.users (id) on delete cascade,
  add column if not exists code_used text,
  add column if not exists status text not null default 'pending',
  add column if not exists reward_amount bigint,
  add column if not exists rewarded_at timestamptz;
create unique index if not exists referrals_referred_id_key on public.referrals (referred_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
select pg_temp.ensure_constraint('public.referrals', 'referrals_no_self_referral',
  'check (referrer_id <> referred_id) not valid');
select pg_temp.ensure_constraint('public.referrals', 'referrals_status_check',
  $c$check (status in ('pending','rewarded','rejected')) not valid$c$);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.withdrawal_requests
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists amount bigint,
  add column if not exists method text,
  add column if not exists destination text,
  add column if not exists status text not null default 'pending',
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists paid_at timestamptz;
create index if not exists withdrawal_requests_user_idx on public.withdrawal_requests (user_id, created_at desc);
select pg_temp.ensure_constraint('public.withdrawal_requests', 'withdrawal_requests_status_check',
  $c$check (status in ('pending','approved','rejected','paid')) not valid$c$);
select pg_temp.ensure_constraint('public.withdrawal_requests', 'withdrawal_requests_amount_positive',
  'check (amount > 0) not valid');

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'account',
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Product defaults (owner can change them in the Admin > Settings tab). NOT secrets.
insert into public.app_settings (key, value) values
  ('min_withdrawal_tokens', '1000'::jsonb),
  ('referral_reward_tokens', '100'::jsonb),
  ('payout_methods', '["paypal","bank_transfer","usdt_trc20"]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Row Level Security: enable everywhere, replace existing policies
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','provider_events','referrals','task_completions','tasks',
                        'wallet_transactions','wallets','withdrawal_requests','tokenhub_test',
                        'notifications','app_settings','admin_users','admin_audit_log')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.profiles            enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_completions    enable row level security;
alter table public.provider_events     enable row level security;
alter table public.referrals           enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.notifications       enable row level security;
alter table public.app_settings        enable row level security;
alter table public.admin_users         enable row level security;
alter table public.admin_audit_log     enable row level security;
do $$ begin
  if to_regclass('public.tokenhub_test') is not null then
    execute 'alter table public.tokenhub_test enable row level security';
    execute 'revoke all on public.tokenhub_test from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Table privileges: least privilege (RLS is the second line of defence)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.wallets, public.wallet_transactions, public.tasks,
  public.task_completions, public.provider_events, public.referrals, public.withdrawal_requests,
  public.notifications, public.app_settings, public.admin_users, public.admin_audit_log
  from anon, authenticated;

grant select on public.profiles, public.wallets, public.wallet_transactions, public.tasks,
  public.task_completions, public.provider_events, public.referrals, public.withdrawal_requests,
  public.notifications, public.app_settings, public.admin_audit_log
  to authenticated;
grant update (username, full_name, avatar_url) on public.profiles to authenticated;
grant insert, update, delete on public.tasks, public.app_settings to authenticated; -- gated by admin-only RLS below

-- ---------------------------------------------------------------------
-- 4. Admin authorisation (admins live in a table users cannot write)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Policies
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy wallets_select on public.wallets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy wallet_tx_select on public.wallet_transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy tasks_select on public.tasks for select to authenticated
  using (is_active or public.is_admin());
create policy tasks_admin_insert on public.tasks for insert to authenticated with check (public.is_admin());
create policy tasks_admin_update on public.tasks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy tasks_admin_delete on public.tasks for delete to authenticated using (public.is_admin());

create policy task_completions_select on public.task_completions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy provider_events_admin_select on public.provider_events for select to authenticated
  using (public.is_admin());

create policy referrals_select on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

create policy withdrawals_select on public.withdrawal_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy app_settings_select on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_insert on public.app_settings for insert to authenticated with check (public.is_admin());
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy app_settings_admin_delete on public.app_settings for delete to authenticated using (public.is_admin());

create policy audit_admin_select on public.admin_audit_log for select to authenticated using (public.is_admin());
-- admin_users: no policies and no grants -> only SECURITY DEFINER functions / service role can read it.

-- ---------------------------------------------------------------------
-- 6. Internal functions (NOT callable by clients)
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create or replace function public.generate_referral_code()
returns text language plpgsql set search_path = public as $$
declare v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function public.get_setting_int(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key = p_key), p_default);
$$;

-- Single place that guarantees profile + referral code + wallet (+ referral link) for a user.
create or replace function public.provision_user(p_user_id uuid, p_email text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_created uuid;
  v_ref_code text;
  v_referrer uuid;
begin
  v_ref_code := nullif(upper(trim(coalesce(p_meta ->> 'referral_code', ''))), '');
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = v_ref_code and id <> p_user_id limit 1;
  end if;

  insert into public.profiles (id, email, username, full_name, referral_code, referred_by)
  values (
    p_user_id, p_email,
    nullif(left(trim(coalesce(p_meta ->> 'username', '')), 40), ''),
    nullif(left(trim(coalesce(p_meta ->> 'full_name', '')), 80), ''),
    public.generate_referral_code(), v_referrer)
  on conflict (id) do nothing
  returning id into v_created;

  update public.profiles
     set referral_code = public.generate_referral_code()
   where id = p_user_id and referral_code is null;
  update public.profiles set email = p_email where id = p_user_id and email is null and p_email is not null;

  insert into public.wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  if v_created is not null then
    if v_referrer is not null then
      insert into public.referrals (referrer_id, referred_id, code_used)
      values (v_referrer, p_user_id, v_ref_code) on conflict (referred_id) do nothing;
    end if;
    insert into public.notifications (user_id, type, title, body)
    values (p_user_id, 'account', 'Welcome to TOKENHUB', 'Your account and wallet are ready. Start earning from the Earn Tokens page.');
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.provision_user(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  exception when others then
    -- never block sign-up; ensure_account() self-heals on first login
    raise warning 'provision_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic, idempotent wallet movement. The ONLY code path that changes balances.
create or replace function public.credit_wallet(
  p_user uuid, p_amount bigint, p_type text, p_description text,
  p_ref_type text, p_ref_id uuid, p_idem text, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tx uuid; v_balance bigint; v_new bigint;
begin
  if p_idem is null or length(p_idem) = 0 then raise exception 'idempotency key required'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'amount must be non-zero'; end if;

  select balance into v_balance from public.wallets where user_id = p_user for update;
  if not found then raise exception 'wallet not found for user'; end if;

  select id into v_tx from public.wallet_transactions where idempotency_key = p_idem;
  if found then return v_tx; end if;               -- replay: no second movement

  v_new := v_balance + p_amount;
  if v_new < 0 then raise exception 'insufficient_funds'; end if;

  update public.wallets set
    balance = v_new,
    lifetime_earned = lifetime_earned + case when p_type in ('task_reward','referral_reward') then p_amount else 0 end,
    lifetime_spent  = greatest(0, lifetime_spent + case
                        when p_type = 'withdrawal' then -p_amount
                        when p_type = 'withdrawal_refund' then -p_amount else 0 end),
    updated_at = now()
  where user_id = p_user;

  insert into public.wallet_transactions
    (user_id, type, amount, balance_after, status, description, reference_type, reference_id, idempotency_key, metadata)
  values (p_user, p_type, p_amount, v_new, 'completed', p_description, p_ref_type, p_ref_id, p_idem, coalesce(p_meta, '{}'::jsonb))
  returning id into v_tx;
  return v_tx;
end $$;
revoke all on function public.credit_wallet(uuid, bigint, text, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_wallet(uuid, bigint, text, text, text, uuid, text, jsonb) to service_role;

revoke all on function public.provision_user(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.provision_user(uuid, text, jsonb) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.generate_referral_code() from public, anon, authenticated;
revoke all on function public.get_setting_int(text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Client-callable functions (authenticated)
-- ---------------------------------------------------------------------
create or replace function public.ensure_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_email text; v_meta jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email, coalesce(raw_user_meta_data, '{}'::jsonb) into v_email, v_meta from auth.users where id = auth.uid();
  perform public.provision_user(auth.uid(), v_email, v_meta);
end $$;

create or replace function public.get_dashboard()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.wallets where user_id = auth.uid()), 0),
    'lifetime_earned', coalesce((select lifetime_earned from public.wallets where user_id = auth.uid()), 0),
    'lifetime_spent', coalesce((select lifetime_spent from public.wallets where user_id = auth.uid()), 0),
    'completed_tasks', (select count(*) from public.task_completions where user_id = auth.uid() and status = 'completed'),
    'referrals_total', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'referrals_rewarded', (select count(*) from public.referrals where referrer_id = auth.uid() and status = 'rewarded'),
    'referral_earnings', coalesce((select sum(amount) from public.wallet_transactions where user_id = auth.uid() and type = 'referral_reward'), 0),
    'pending_withdrawals', (select count(*) from public.withdrawal_requests where user_id = auth.uid() and status in ('pending','approved')),
    'unread_notifications', (select count(*) from public.notifications where user_id = auth.uid() and not is_read)
  );
$$;

create or replace function public.start_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_task public.tasks; v_done int; v_open public.task_completions;
  v_id uuid; v_click uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select is_active from public.profiles where id = v_uid), false) then
    raise exception 'account_inactive';
  end if;
  select * into v_task from public.tasks where id = p_task_id and is_active;
  if not found then raise exception 'task_unavailable'; end if;

  select count(*) into v_done from public.task_completions
   where user_id = v_uid and task_id = p_task_id and status = 'completed';
  if v_done >= coalesce(v_task.max_completions_per_user, 1) then raise exception 'task_limit_reached'; end if;

  select * into v_open from public.task_completions
   where user_id = v_uid and task_id = p_task_id and status = 'started' and started_at > now() - interval '7 days'
   order by started_at desc limit 1;
  if found then
    v_click := v_open.click_id;
  else
    insert into public.task_completions (user_id, task_id, status) values (v_uid, p_task_id, 'started')
    returning id, click_id into v_id, v_click;
  end if;

  return jsonb_build_object(
    'click_id', v_click,
    'action_url', case when v_task.action_url is null then null
                       else replace(v_task.action_url, '{click_id}', v_click::text) end);
end $$;

create or replace function public.request_withdrawal(p_amount bigint, p_method text, p_destination text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_min bigint; v_id uuid; v_dest text := trim(coalesce(p_destination, ''));
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select is_active from public.profiles where id = v_uid), false) then raise exception 'account_inactive'; end if;
  v_min := public.get_setting_int('min_withdrawal_tokens', 1000);
  if p_amount is null or p_amount < v_min then raise exception 'below_minimum:%', v_min; end if;
  if not exists (select 1 from public.app_settings where key = 'payout_methods' and value ? p_method) then
    raise exception 'unsupported_method';
  end if;
  if char_length(v_dest) < 3 or char_length(v_dest) > 200 then raise exception 'invalid_destination'; end if;
  if (select count(*) from public.withdrawal_requests where user_id = v_uid and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;

  insert into public.withdrawal_requests (user_id, amount, method, destination, status)
  values (v_uid, p_amount, p_method, v_dest, 'pending') returning id into v_id;

  perform public.credit_wallet(v_uid, -p_amount, 'withdrawal', 'Withdrawal request (' || p_method || ')',
                               'withdrawal_request', v_id, 'withdrawal:' || v_id);
  insert into public.notifications (user_id, type, title, body)
  values (v_uid, 'withdrawal', 'Withdrawal requested', p_amount || ' tokens are on hold while your request is reviewed.');
  return v_id;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications set is_read = true
   where user_id = auth.uid() and not is_read and (p_ids is null or id = any (p_ids));
$$;

-- ---------------------------------------------------------------------
-- 8. Provider reward processing (service_role only; amount comes from the DB)
-- ---------------------------------------------------------------------
create or replace function public.process_provider_event(
  p_provider text, p_event_id text, p_click_id uuid, p_event_type text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event uuid; v_comp public.task_completions; v_task public.tasks; v_ref public.referrals;
  v_reward bigint; v_ref_reward bigint;

begin
  insert into public.provider_events (provider, event_id, event_type, click_id, payload, status)
  values (p_provider, p_event_id, p_event_type, p_click_id, coalesce(p_payload, '{}'::jsonb), 'received')
  on conflict (provider, event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('status', 'duplicate'); end if;

  select * into v_comp from public.task_completions where click_id = p_click_id for update;
  if not found then
    update public.provider_events set status = 'rejected', error = 'unknown_click_id', processed_at = now() where id = v_event;
    return jsonb_build_object('status', 'rejected', 'reason', 'unknown_click_id');
  end if;
  update public.provider_events set user_id = v_comp.user_id, task_id = v_comp.task_id where id = v_event;

  if v_comp.status <> 'started' then
    update public.provider_events set status = 'rejected', error = 'completion_not_open', processed_at = now() where id = v_event;
    return jsonb_build_object('status', 'rejected', 'reason', 'completion_not_open');
  end if;
  if p_event_type <> 'completed' then
    update public.provider_events set status = 'rejected', error = 'unsupported_event_type', processed_at = now() where id = v_event;
    return jsonb_build_object('status', 'rejected', 'reason', 'unsupported_event_type');
  end if;

  select * into v_task from public.tasks where id = v_comp.task_id;
  if not found or v_task.provider is distinct from p_provider then
    update public.provider_events set status = 'rejected', error = 'provider_mismatch', processed_at = now() where id = v_event;
    return jsonb_build_object('status', 'rejected', 'reason', 'provider_mismatch');
  end if;
  if not coalesce((select is_active from public.profiles where id = v_comp.user_id), false) then
    update public.provider_events set status = 'rejected', error = 'account_inactive', processed_at = now() where id = v_event;
    return jsonb_build_object('status', 'rejected', 'reason', 'account_inactive');
  end if;

  v_reward := v_task.reward;                       -- server-side amount, never the provider's claim
  if v_reward > 0 then
    perform public.credit_wallet(v_comp.user_id, v_reward, 'task_reward', 'Reward: ' || v_task.title,
                                 'task_completion', v_comp.id, 'task:' || v_comp.id,
                                 jsonb_build_object('provider', p_provider, 'provider_event', p_event_id));
  end if;
  update public.task_completions set status = 'completed', reward_amount = v_reward, completed_at = now() where id = v_comp.id;
  insert into public.notifications (user_id, type, title, body)
  values (v_comp.user_id, 'reward', 'Reward credited', '+' || v_reward || ' tokens for "' || v_task.title || '".');

  -- Referral qualification: referred user's FIRST verified completion
  select * into v_ref from public.referrals where referred_id = v_comp.user_id and status = 'pending' for update;
  if found and v_ref.referrer_id <> v_ref.referred_id
     and coalesce((select is_active from public.profiles where id = v_ref.referrer_id), false) then
    v_ref_reward := public.get_setting_int('referral_reward_tokens', 0);
    if v_ref_reward > 0 then
      perform public.credit_wallet(v_ref.referrer_id, v_ref_reward, 'referral_reward', 'Referral reward',
                                   'referral', v_ref.id, 'referral:' || v_ref.id);
      insert into public.notifications (user_id, type, title, body)
      values (v_ref.referrer_id, 'referral', 'Referral reward', '+' || v_ref_reward || ' tokens: a friend you invited completed a first task.');
    end if;
    update public.referrals set status = 'rewarded', reward_amount = v_ref_reward, rewarded_at = now() where id = v_ref.id;
  end if;

  update public.provider_events set status = 'processed', processed_at = now() where id = v_event;
  return jsonb_build_object('status', 'processed', 'reward', v_reward);
end $$;
revoke all on function public.process_provider_event(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.process_provider_event(text, text, uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 9. Admin functions (every one checks is_admin())
-- ---------------------------------------------------------------------
create or replace function public.admin_review_withdrawal(p_id uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.withdrawal_requests; v_new text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_action not in ('approve','reject','pay') then raise exception 'invalid_action'; end if;
  select * into v_req from public.withdrawal_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_req.user_id = auth.uid() then raise exception 'cannot_review_own_request'; end if;

  if p_action = 'approve' and v_req.status = 'pending' then v_new := 'approved';
  elsif p_action = 'pay' and v_req.status = 'approved' then v_new := 'paid';
  elsif p_action = 'reject' and v_req.status in ('pending','approved') then v_new := 'rejected';
  else raise exception 'invalid_transition:% -> %', v_req.status, p_action; end if;

  update public.withdrawal_requests set status = v_new, admin_note = coalesce(p_note, admin_note),
         reviewed_by = auth.uid(), reviewed_at = now(), paid_at = case when v_new = 'paid' then now() else paid_at end
   where id = p_id;

  if v_new = 'rejected' then
    perform public.credit_wallet(v_req.user_id, v_req.amount, 'withdrawal_refund', 'Withdrawal rejected: refund',
                                 'withdrawal_request', v_req.id, 'withdrawal_refund:' || v_req.id);
  end if;
  insert into public.notifications (user_id, type, title, body)
  values (v_req.user_id, 'withdrawal', 'Withdrawal ' || v_new,
          case v_new when 'approved' then 'Your withdrawal was approved and will be paid soon.'
                     when 'paid' then 'Your withdrawal has been paid.'
                     else 'Your withdrawal was rejected and the tokens were returned to your wallet.' end
          || coalesce(' Note: ' || p_note, ''));
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'withdrawal_' || v_new, 'withdrawal_request', p_id, jsonb_build_object('note', p_note));
end $$;

create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_modify_self'; end if;
  update public.profiles set is_active = p_active where id = p_user;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_active then 'user_activated' else 'user_suspended' end, 'user', p_user, '{}'::jsonb);
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, email text, username text, is_active boolean, created_at timestamptz,
               balance bigint, lifetime_earned bigint, is_admin boolean, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.email, p.username, p.is_active, p.created_at,
           coalesce(w.balance, 0)::bigint, coalesce(w.lifetime_earned, 0)::bigint,
           exists (select 1 from public.admin_users a where a.user_id = p.id),
           count(*) over ()
      from public.profiles p left join public.wallets w on w.user_id = p.id
     where p_search is null or p_search = ''
        or p.email ilike '%' || p_search || '%' or p.username ilike '%' || p_search || '%'
     order by p.created_at desc
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where is_active),
    'tokens_in_wallets', coalesce((select sum(balance) from public.wallets), 0),
    'tokens_issued', coalesce((select sum(amount) from public.wallet_transactions where type in ('task_reward','referral_reward')), 0),
    'completions', (select count(*) from public.task_completions where status = 'completed'),
    'active_tasks', (select count(*) from public.tasks where is_active),
    'pending_withdrawals', (select count(*) from public.withdrawal_requests where status = 'pending'),
    'pending_withdrawal_tokens', coalesce((select sum(amount) from public.withdrawal_requests where status = 'pending'), 0),
    'paid_withdrawal_tokens', coalesce((select sum(amount) from public.withdrawal_requests where status = 'paid'), 0),
    'rejected_provider_events', (select count(*) from public.provider_events where status = 'rejected'));
end $$;

-- Execute grants for client-callable functions
revoke all on function public.ensure_account() from public, anon;
revoke all on function public.get_dashboard() from public, anon;
revoke all on function public.start_task(uuid) from public, anon;
revoke all on function public.request_withdrawal(bigint, text, text) from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.admin_review_withdrawal(uuid, text, text) from public, anon;
revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
revoke all on function public.admin_list_users(text, int, int) from public, anon;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.ensure_account(), public.get_dashboard(), public.start_task(uuid),
  public.request_withdrawal(bigint, text, text), public.mark_notifications_read(uuid[]),
  public.admin_review_withdrawal(uuid, text, text), public.admin_set_user_active(uuid, boolean),
  public.admin_list_users(text, int, int), public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 10. Safe backfills (insert-only; existing rows are not modified except NULL gaps)
-- ---------------------------------------------------------------------
select public.provision_user(u.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb))
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
    or not exists (select 1 from public.wallets w where w.user_id = u.id)
    or exists (select 1 from public.profiles p where p.id = u.id and p.referral_code is null);

update public.wallets w
   set lifetime_earned = coalesce((select sum(t.amount) from public.wallet_transactions t
                                    where t.user_id = w.user_id and t.amount > 0), 0)
 where w.lifetime_earned = 0;

commit;
