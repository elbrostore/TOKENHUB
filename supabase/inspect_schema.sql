-- READ-ONLY inspection of the REAL TOKENHUB schema. Safe to run in the Supabase SQL editor.
-- Run it BEFORE applying the migration and compare with the assumptions in the migration header.

-- 1. Columns of every TOKENHUB table
select table_name, ordinal_position as pos, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','provider_events','referrals','task_completions','tasks','wallet_transactions',
                     'wallets','withdrawal_requests','tokenhub_test','notifications','app_settings')
order by table_name, ordinal_position;

-- 2. Constraints and indexes
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2;

-- 3. RLS status and EXISTING policies (the migration replaces these)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1;
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;

-- 4. Table privileges currently granted to anon / authenticated
select table_name, grantee, string_agg(privilege_type, ', ') as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
group by 1, 2 order by 1, 2;

-- 5. Triggers on auth.users and public functions (look for an existing "handle_new_user")
select tgname, pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;

-- 6. Row counts (to size the backfill and confirm nothing is lost)
select 'auth.users' as t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'wallets', count(*) from public.wallets
union all select 'wallet_transactions', count(*) from public.wallet_transactions
union all select 'tasks', count(*) from public.tasks
union all select 'withdrawal_requests', count(*) from public.withdrawal_requests;

-- 7. Users that would be backfilled
select count(*) as users_without_profile from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
select count(*) as users_without_wallet from auth.users u where not exists (select 1 from public.wallets w where w.user_id = u.id);
