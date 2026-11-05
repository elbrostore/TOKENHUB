
begin;

create or replace function public.credit_wallet(
  p_user uuid,
  p_amount bigint,
  p_type text,
  p_description text,
  p_ref_type text,
  p_ref_id uuid,
  p_idem text,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx uuid;
  v_balance bigint;
  v_new bigint;
begin
  if p_idem is null or length(p_idem) = 0 then
    raise exception 'idempotency key required';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'amount must be non-zero';
  end if;

  select balance
  into v_balance
  from public.wallets
  where user_id = p_user
  for update;

  if not found then
    raise exception 'wallet not found for user';
  end if;

  select id
  into v_tx
  from public.wallet_transactions
  where idempotency_key = p_idem;

  if found then
    return v_tx;
  end if;

  v_new := v_balance + p_amount;

  if v_new < 0 then
    raise exception 'insufficient_funds';
  end if;

  update public.wallets
  set
    balance = v_new,
    lifetime_earned = lifetime_earned + case
      when p_type in ('task_reward', 'referral_reward', 'offerwall_reward')
      then p_amount else 0 end,
    lifetime_spent = greatest(
      0,
      lifetime_spent + case
        when p_type in ('withdrawal', 'withdrawal_refund')
        then -p_amount else 0 end
    ),
    updated_at = now()
  where user_id = p_user;

  insert into public.wallet_transactions (
    user_id,
    type,
    amount,
    balance_after,
    status,
    description,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  values (
    p_user,
    p_type,
    p_amount,
    v_new,
    'completed',
    p_description,
    p_ref_type,
    p_ref_id,
    p_idem,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_tx;

  return v_tx;
end;
$$;

revoke all on function public.credit_wallet(
  uuid, bigint, text, text, text, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.credit_wallet(
  uuid, bigint, text, text, text, uuid, text, jsonb
) to service_role;

commit;
