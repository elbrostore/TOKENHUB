begin;

-- Serialize withdrawals with Offerwall credits and reversals.
create or replace function public.block_withdrawal_if_offerwall_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
begin
  -- Lock the user's wallet before checking pending debts.
  select user_id
  into v_wallet_id
  from public.wallets
  where user_id = new.user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Check debts after acquiring the wallet lock.
  if exists (
    select 1
    from public.offerwall_reversal_debts d
    where d.user_id = new.user_id
      and d.status = 'pending'
      and d.remaining_tokens > 0
  ) then
    raise exception 'offerwall_reversal_pending';
  end if;

  return new;
end;
$$;

-- Refresh Admin statistics and include Offerwall rewards.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where is_active),
    'tokens_in_wallets', coalesce(
      (select sum(balance) from public.wallets), 0
    ),
    'tokens_issued', coalesce(
      (
        select sum(amount)
        from public.wallet_transactions
        where type in (
          'task_reward',
          'referral_reward',
          'offerwall_reward'
        )
      ), 0
    ),
    'completions', (
      select count(*)
      from public.task_completions
      where status = 'completed'
    ),
    'active_tasks', (
      select count(*) from public.tasks where is_active
    ),
    'pending_withdrawals', (
      select count(*)
      from public.withdrawal_requests
      where status = 'pending'
    ),
    'pending_withdrawal_tokens', coalesce(
      (
        select sum(amount)
        from public.withdrawal_requests
        where status = 'pending'
      ), 0
    ),
    'paid_withdrawal_tokens', coalesce(
      (
        select sum(amount)
        from public.withdrawal_requests
        where status = 'paid'
      ), 0
    ),
    'rejected_provider_events', (
      select count(*)
      from public.provider_events
      where status = 'rejected'
    )
  );
end;
$$;

revoke all on function public.admin_stats()
from public, anon;

grant execute on function public.admin_stats()
to authenticated;

revoke all on function public.block_withdrawal_if_offerwall_debt()
from public, anon, authenticated;

commit;