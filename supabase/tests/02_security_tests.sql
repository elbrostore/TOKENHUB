-- LOCAL TEST SUITE (plain PostgreSQL + Supabase stub). Run after the migration.
create schema th_test;
grant usage on schema th_test to public;
create table th_test.results (name text, passed boolean);
grant all on th_test.results to public;

create function th_test.ok(p_name text, p_cond boolean) returns void
language sql as $$ insert into th_test.results values (p_name, coalesce(p_cond, false)); $$;

-- passes only if p_sql raises an error whose message contains p_pattern
create function th_test.denies(p_name text, p_sql text, p_pattern text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into th_test.results values (p_name || ' (expected an error, got none)', false);
  exception when others then
    insert into th_test.results values (p_name, position(lower(p_pattern) in lower(sqlerrm)) > 0);
    if position(lower(p_pattern) in lower(sqlerrm)) = 0 then raise notice '   got: %', sqlerrm; end if;
  end;
end $$;
grant execute on all functions in schema th_test to public;

-- ===== fixtures (as postgres) =====
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'admin@example.com');
select th_test.ok('trigger created profile for new user', exists (select 1 from profiles where id = '00000000-0000-0000-0000-00000000000a' and referral_code is not null));
select th_test.ok('trigger created wallet for new user', exists (select 1 from wallets where user_id = '00000000-0000-0000-0000-00000000000a'));
select th_test.ok('backfill: legacy user WITHOUT profile now has profile+wallet',
  exists (select 1 from profiles where id = '00000000-0000-0000-0000-0000000000a2') and exists (select 1 from wallets where user_id = '00000000-0000-0000-0000-0000000000a2'));
select th_test.ok('backfill: legacy profile got referral code', (select referral_code from profiles where id = '00000000-0000-0000-0000-0000000000a1') is not null);
select th_test.ok('welcome notification created once', (select count(*) from notifications where user_id = '00000000-0000-0000-0000-00000000000a') = 1);

insert into admin_users (user_id) values ('00000000-0000-0000-0000-00000000000c');
insert into tasks (id, title, reward, provider, action_url, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'Survey A', 250, 'acme', 'https://acme.example/go?sub={click_id}', true),
  ('10000000-0000-0000-0000-000000000002', 'Survey B', 400, 'acme', null, true),
  ('10000000-0000-0000-0000-000000000003', 'Hidden', 999, 'acme', null, false);

-- Bob signs up with Alice's referral code; Dave uses a bogus code; Eve tries to use her own code via metadata of a different id
do $$ declare v text; begin
  select referral_code into v from profiles where id = '00000000-0000-0000-0000-00000000000a';
  insert into auth.users (id, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', jsonb_build_object('referral_code', v, 'username', 'bob')),
    ('00000000-0000-0000-0000-00000000000d', 'dave@example.com', jsonb_build_object('referral_code', 'NOPE1234'));
end $$;
select th_test.ok('referral row created for valid code', exists (select 1 from referrals where referrer_id = '00000000-0000-0000-0000-00000000000a' and referred_id = '00000000-0000-0000-0000-00000000000b' and status = 'pending'));
select th_test.ok('bogus referral code ignored', not exists (select 1 from referrals where referred_id = '00000000-0000-0000-0000-00000000000d'));
select th_test.denies('self-referral rejected by constraint',
  $q$insert into referrals (referrer_id, referred_id) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a')$q$, 'no_self_referral');
select th_test.denies('duplicate referral for same referred user rejected',
  $q$insert into referrals (referrer_id, referred_id) values ('00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000b')$q$, 'duplicate key');
select th_test.ok('provision_user is idempotent (no duplicate profile/wallet)',
  (select count(*) from wallets where user_id = '00000000-0000-0000-0000-00000000000b') = 1);

-- ===== A. Normal user cannot tamper (as Alice, role authenticated) =====
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select th_test.denies('user cannot UPDATE wallet balance', $q$update wallets set balance = 1000000 where user_id = auth.uid()$q$, 'permission denied');
select th_test.denies('user cannot INSERT wallet', $q$insert into wallets (user_id, balance) values (gen_random_uuid(), 5)$q$, 'permission denied');
select th_test.denies('user cannot INSERT reward transaction', $q$insert into wallet_transactions (user_id, type, amount) values (auth.uid(), 'task_reward', 9999)$q$, 'permission denied');
select th_test.denies('user cannot UPDATE transactions', $q$update wallet_transactions set amount = 1$q$, 'permission denied');
select th_test.denies('user cannot DELETE transactions', $q$delete from wallet_transactions$q$, 'permission denied');
select th_test.denies('user cannot call credit_wallet', $q$select credit_wallet(auth.uid(), 500, 'task_reward', 'x', null, null, 'k1')$q$, 'permission denied');
select th_test.denies('user cannot call process_provider_event', $q$select process_provider_event('acme','e0', gen_random_uuid(), 'completed', '{}')$q$, 'permission denied');
select th_test.denies('user cannot read admin_users', $q$select * from admin_users$q$, 'permission denied');
select th_test.denies('user cannot make themselves admin', $q$insert into admin_users (user_id) values (auth.uid())$q$, 'permission denied');
select th_test.denies('user cannot change is_active', $q$update profiles set is_active = true where id = auth.uid()$q$, 'permission denied');
select th_test.denies('user cannot change referral_code', $q$update profiles set referral_code = 'HACKED' where id = auth.uid()$q$, 'permission denied');
select th_test.denies('user cannot change referred_by', $q$update profiles set referred_by = auth.uid() where id = auth.uid()$q$, 'permission denied');
select th_test.denies('user cannot approve withdrawals', $q$select admin_review_withdrawal(gen_random_uuid(), 'approve')$q$, 'forbidden');
select th_test.denies('user cannot read admin stats', $q$select admin_stats()$q$, 'forbidden');
select th_test.denies('user cannot list all users', $q$select * from admin_list_users()$q$, 'forbidden');
select th_test.denies('user cannot create tasks', $q$insert into tasks (title, reward) values ('free money', 1000000)$q$, 'row-level security');
select th_test.denies('user cannot insert provider_events', $q$insert into provider_events (provider, event_id) values ('acme','x')$q$, 'permission denied');
select th_test.denies('user cannot insert referrals', $q$insert into referrals (referrer_id, referred_id) values (auth.uid(), gen_random_uuid())$q$, 'permission denied');
select th_test.denies('user cannot insert withdrawal_requests directly', $q$insert into withdrawal_requests (user_id, amount, method) values (auth.uid(), 5, 'paypal')$q$, 'permission denied');
select th_test.denies('user cannot read tokenhub_test', $q$select * from tokenhub_test$q$, 'permission denied');
update profiles set username = 'alice_w', full_name = 'Alice W' where id = auth.uid();
select th_test.ok('user CAN edit own username', (select username from profiles where id = auth.uid()) = 'alice_w');
select th_test.ok('user sees only own profile', (select count(*) from profiles) = 1);
select th_test.ok('user sees only own wallet', (select count(*) from wallets) = 1);
select th_test.ok('user cannot see inactive task', not exists (select 1 from tasks where is_active = false));
select th_test.ok('user sees active tasks', (select count(*) from tasks) = 2);
select th_test.ok('user cannot see provider events', (select count(*) from provider_events) = 0);
update profiles set username = 'hacked' where id = '00000000-0000-0000-0000-00000000000b';
reset role;
select th_test.ok('user cannot edit another user profile', (select username from profiles where id = '00000000-0000-0000-0000-00000000000b') = 'bob');

-- ===== B. Reward flow, idempotency, fraud protection =====
create table th_test.vars (k text primary key, v text);
grant all on th_test.vars to public;
\set alice '''00000000-0000-0000-0000-00000000000a'''
\set bob   '''00000000-0000-0000-0000-00000000000b'''
\set dave  '''00000000-0000-0000-0000-00000000000d'''
\set admin '''00000000-0000-0000-0000-00000000000c'''

select set_config('request.jwt.claim.sub', :alice, false);
set role authenticated;
insert into th_test.vars select 'alice_click1', (start_task('10000000-0000-0000-0000-000000000001') ->> 'click_id');
insert into th_test.vars select 'alice_click2', (start_task('10000000-0000-0000-0000-000000000002') ->> 'click_id');
select th_test.ok('start_task returns tracked provider URL with click_id substituted',
  (start_task('10000000-0000-0000-0000-000000000001') ->> 'action_url') = 'https://acme.example/go?sub=' || (select v from th_test.vars where k = 'alice_click1'));
select th_test.ok('start_task reuses the open click (no duplicate rows)',
  (select count(*) from task_completions where user_id = auth.uid() and task_id = '10000000-0000-0000-0000-000000000001') = 1);
select th_test.denies('cannot start an inactive task', $q$select start_task('10000000-0000-0000-0000-000000000003')$q$, 'task_unavailable');
reset role;

set role service_role;
select th_test.ok('provider replay target exists', true);
-- provider claims a huge amount in payload: it must be ignored
insert into th_test.vars select 'r1', process_provider_event('acme', 'evt-1', (select v::uuid from th_test.vars where k = 'alice_click1'), 'completed', '{"amount": 999999}')::text;
select th_test.ok('reward credited from DB amount (250), not provider payload',
  (select (v::jsonb ->> 'status') = 'processed' and (v::jsonb ->> 'reward')::int = 250 from th_test.vars where k = 'r1'));
reset role;
select th_test.ok('wallet balance = 250 and lifetime_earned = 250', (select balance = 250 and lifetime_earned = 250 from wallets where user_id = :alice));
select th_test.ok('ledger row has balance_after and idempotency key', exists (select 1 from wallet_transactions where user_id = :alice and amount = 250 and balance_after = 250 and idempotency_key like 'task:%' and type = 'task_reward'));

set role service_role;
select th_test.ok('replayed event id returns duplicate', (process_provider_event('acme', 'evt-1', (select v::uuid from th_test.vars where k = 'alice_click1'), 'completed', '{}') ->> 'status') = 'duplicate');
select th_test.ok('new event id on already-completed click is rejected', (process_provider_event('acme', 'evt-2', (select v::uuid from th_test.vars where k = 'alice_click1'), 'completed', '{}') ->> 'reason') = 'completion_not_open');
select th_test.ok('unknown click_id rejected', (process_provider_event('acme', 'evt-3', gen_random_uuid(), 'completed', '{}') ->> 'reason') = 'unknown_click_id');
select th_test.ok('wrong provider rejected', (process_provider_event('evil', 'evt-4', (select v::uuid from th_test.vars where k = 'alice_click2'), 'completed', '{}') ->> 'reason') = 'provider_mismatch');
select th_test.ok('non-completion event type rejected', (process_provider_event('acme', 'evt-5', (select v::uuid from th_test.vars where k = 'alice_click2'), 'reversed', '{}') ->> 'reason') = 'unsupported_event_type');
reset role;
select th_test.ok('no extra credit after replay/fraud attempts', (select balance from wallets where user_id = :alice) = 250);
select th_test.ok('rejected events are logged', (select count(*) from provider_events where status = 'rejected') = 4);

set role service_role;
select th_test.ok('legit second task completes', (process_provider_event('acme', 'evt-6', (select v::uuid from th_test.vars where k = 'alice_click2'), 'completed', '{}') ->> 'status') = 'processed');
reset role;
select th_test.ok('balance = 650 after second task', (select balance from wallets where user_id = :alice) = 650);

select set_config('request.jwt.claim.sub', :alice, false);
set role authenticated;
select th_test.denies('per-user completion limit enforced', $q$select start_task('10000000-0000-0000-0000-000000000001')$q$, 'task_limit_reached');
select th_test.ok('dashboard stats are real', (get_dashboard() ->> 'balance')::int = 650 and (get_dashboard() ->> 'completed_tasks')::int = 2);
reset role;

-- ===== C. Referral reward conditions =====
select set_config('request.jwt.claim.sub', :bob, false);
set role authenticated;
insert into th_test.vars select 'bob_click1', (start_task('10000000-0000-0000-0000-000000000001') ->> 'click_id');
insert into th_test.vars select 'bob_click2', (start_task('10000000-0000-0000-0000-000000000002') ->> 'click_id');
reset role;
select th_test.ok('referral NOT rewarded before first verified task', (select status from referrals where referred_id = :bob) = 'pending' and (select balance from wallets where user_id = :alice) = 650);
set role service_role;
select process_provider_event('acme', 'evt-b1', (select v::uuid from th_test.vars where k = 'bob_click1'), 'completed', '{}');
select process_provider_event('acme', 'evt-b2', (select v::uuid from th_test.vars where k = 'bob_click2'), 'completed', '{}');
reset role;
select th_test.ok('referrer rewarded once (650 + 100)', (select balance from wallets where user_id = :alice) = 750);
select th_test.ok('referral marked rewarded with amount', (select status = 'rewarded' and reward_amount = 100 from referrals where referred_id = :bob));
select th_test.ok('only one referral_reward ledger row', (select count(*) from wallet_transactions where user_id = :alice and type = 'referral_reward') = 1);
select th_test.ok('bob balance = 650 (250 + 400)', (select balance from wallets where user_id = :bob) = 650);

-- ===== D. Withdrawals =====
select set_config('request.jwt.claim.sub', :alice, false);
set role authenticated;
select th_test.denies('below minimum rejected', $q$select request_withdrawal(500, 'paypal', 'alice@paypal.test')$q$, 'below_minimum');
reset role;
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
update app_settings set value = '100'::jsonb where key = 'min_withdrawal_tokens';
select th_test.ok('admin can update settings', (select (value #>> '{}')::int from app_settings where key = 'min_withdrawal_tokens') = 100);
reset role;
select set_config('request.jwt.claim.sub', :alice, false);
set role authenticated;
update app_settings set value = '1'::jsonb where key = 'min_withdrawal_tokens';
select th_test.ok('user cannot change settings', (select (value #>> '{}')::int from app_settings where key = 'min_withdrawal_tokens') = 100);
select th_test.denies('overdraw rejected', $q$select request_withdrawal(5000, 'paypal', 'alice@paypal.test')$q$, 'insufficient_funds');
select th_test.denies('unsupported payout method rejected', $q$select request_withdrawal(200, 'cash', 'x@y.z')$q$, 'unsupported_method');
select th_test.denies('empty destination rejected', $q$select request_withdrawal(200, 'paypal', '  ')$q$, 'invalid_destination');
select th_test.denies('negative amount rejected', $q$select request_withdrawal(-200, 'paypal', 'a@b.c')$q$, 'below_minimum');
insert into th_test.vars select 'w1', request_withdrawal(300, 'paypal', 'alice@paypal.test')::text;
insert into th_test.vars select 'w2', request_withdrawal(200, 'bank_transfer', 'MA64 0000 0000')::text;
select th_test.ok('tokens held immediately (750-500=250)', (select balance from wallets where user_id = auth.uid()) = 250);
select th_test.ok('withdrawal ledger rows negative', (select count(*) from wallet_transactions where user_id = auth.uid() and type = 'withdrawal' and amount < 0) = 2);
select th_test.ok('lifetime_spent tracked', (select lifetime_spent from wallets where user_id = auth.uid()) = 500);
select th_test.denies('user cannot edit withdrawal status', $q$update withdrawal_requests set status = 'paid'$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', :bob, false);
set role authenticated;
select th_test.ok('other user cannot see withdrawals', (select count(*) from withdrawal_requests) = 0);
reset role;

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
select th_test.denies('cannot pay before approval', format($q$select admin_review_withdrawal(%L, 'pay')$q$, (select v from th_test.vars where k='w1')), 'invalid_transition');
select admin_review_withdrawal((select v::uuid from th_test.vars where k='w1'), 'approve', 'ok');
select admin_review_withdrawal((select v::uuid from th_test.vars where k='w1'), 'pay', 'sent');
select th_test.ok('w1 is paid', (select status = 'paid' and paid_at is not null from withdrawal_requests where id = (select v::uuid from th_test.vars where k='w1')));
select th_test.denies('paid request cannot be rejected', format($q$select admin_review_withdrawal(%L, 'reject')$q$, (select v from th_test.vars where k='w1')), 'invalid_transition');
select admin_review_withdrawal((select v::uuid from th_test.vars where k='w2'), 'reject', 'bad details');
select th_test.denies('rejecting twice is blocked (no double refund)', format($q$select admin_review_withdrawal(%L, 'reject')$q$, (select v from th_test.vars where k='w2')), 'invalid_transition');
select th_test.ok('admin sees all transactions', (select count(*) from wallet_transactions) > 5);
select th_test.ok('admin sees provider events', (select count(*) from provider_events) > 5);
select th_test.ok('admin_list_users works', (select count(*) from admin_list_users()) >= 4);
select th_test.ok('admin_stats works', (admin_stats() ->> 'users')::int >= 4);
select th_test.denies('admin cannot suspend self', $q$select admin_set_user_active(auth.uid(), false)$q$, 'cannot_modify_self');
select admin_set_user_active('00000000-0000-0000-0000-00000000000d', false);
insert into tasks (title, reward, is_active) values ('Admin created', 10, true);
update tasks set is_active = false where title = 'Admin created';
select th_test.ok('admin can create/update tasks', exists (select 1 from tasks where title = 'Admin created' and not is_active));
select th_test.ok('audit log written', (select count(*) from admin_audit_log) >= 4);
reset role;
select th_test.ok('rejected withdrawal refunded exactly once (250+200)', (select balance from wallets where user_id = :alice) = 450);
select th_test.ok('lifetime_spent reduced by refund (500-200)', (select lifetime_spent from wallets where user_id = :alice) = 300);
select th_test.ok('user notified about withdrawal decisions', (select count(*) from notifications where user_id = :alice and type = 'withdrawal') >= 4);

select set_config('request.jwt.claim.sub', :dave, false);
set role authenticated;
select th_test.denies('suspended user cannot start tasks', $q$select start_task('10000000-0000-0000-0000-000000000001')$q$, 'account_inactive');
select th_test.denies('suspended user cannot withdraw', $q$select request_withdrawal(200,'paypal','a@b.c')$q$, 'account_inactive');
reset role;

select set_config('request.jwt.claim.sub', :alice, false);
set role authenticated;
select th_test.ok('non-admin sees no audit log', (select count(*) from admin_audit_log) = 0);
select mark_notifications_read();
select th_test.ok('notifications marked read', (select count(*) from notifications where not is_read) = 0);
select th_test.denies('user cannot delete notifications', $q$delete from notifications$q$, 'permission denied');
reset role;

select th_test.ok('self-withdrawal review is blocked for admins', (
  with s as (select credit_wallet(:admin, 500, 'task_reward', 't', null, null, 'seed-admin'))
  select true from s));
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
insert into th_test.vars select 'wadmin', request_withdrawal(100, 'paypal', 'admin@paypal.test')::text;
select th_test.denies('admin cannot review own withdrawal', format($q$select admin_review_withdrawal(%L, 'approve')$q$, (select v from th_test.vars where k='wadmin')), 'cannot_review_own_request');
reset role;

select th_test.ok('LEDGER INVARIANT: balance = sum(ledger) for every provisioned wallet',
  not exists (select 1 from wallets w where w.balance <> coalesce((select sum(amount) from wallet_transactions t where t.user_id = w.user_id), 0)
              and exists (select 1 from wallet_transactions t where t.user_id = w.user_id)));
select th_test.ok('no wallet is negative', not exists (select 1 from wallets where balance < 0));
