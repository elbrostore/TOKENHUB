
begin;

-- 1. Store reversals that arrive before their original reward.
create table if not exists public.offerwall_pending_reversals (
  id uuid primary key default gen_random_uuid(),
  trans_id text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  reward_units bigint not null check (reward_units > 0),
  payout_usd numeric(12,4) not null default 0 check (payout_usd >= 0),
  offer_name text,
  offer_type text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists offerwall_pending_reversals_user_idx
on public.offerwall_pending_reversals (user_id, status);

alter table public.offerwall_pending_reversals enable row level security;

revoke all on public.offerwall_pending_reversals
from public, anon, authenticated;

-- 2. Replace the transaction processor.
create or replace function public.process_offerwall_transaction(
  p_trans_id text,
  p_user_id uuid,
  p_reward_units bigint,
  p_payout_usd numeric,
  p_status text,
  p_offer_name text,
  p_offer_type text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.offerwall_transactions%rowtype;
  v_pending public.offerwall_pending_reversals%rowtype;
  v_balance bigint;
  v_user_tokens bigint;
  v_remaining bigint;
  v_debt record;
  v_pay bigint;
  v_new_remaining bigint;
begin
  if p_trans_id is null
     or length(trim(p_trans_id)) = 0
     or length(p_trans_id) > 255 then
    raise exception 'invalid_transaction_id';
  end if;

  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;

  if p_reward_units is null or p_reward_units <= 0 then
    raise exception 'invalid_reward';
  end if;

  if p_status not in ('1', '2') or p_status is null then
    raise exception 'invalid_provider_status';
  end if;

  if p_payout_usd is null or p_payout_usd < 0 then
    raise exception 'invalid_payout';
  end if;

  -- Lock wallet to serialize rewards, reversals and withdrawals.
  select balance
  into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- STATUS 1: reward callback.
  if p_status = '1' then

    v_user_tokens := floor(p_reward_units::numeric * 0.20)::bigint;

    if v_user_tokens <= 0 then
      raise exception 'reward_below_minimum';
    end if;

    insert into public.offerwall_transactions (
      trans_id,
      user_id,
      offer_name,
      offer_type,
      reward_units,
      payout_usd,
      user_tokens,
      status,
      provider_status,
      metadata
    )
    values (
      p_trans_id,
      p_user_id,
      p_offer_name,
      p_offer_type,
      p_reward_units,
      p_payout_usd,
      v_user_tokens,
      'credited',
      '1',
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (trans_id) do nothing
    returning * into v_tx;

    -- Duplicate callback: never credit twice.
    if not found then
      select *
      into v_tx
      from public.offerwall_transactions
      where trans_id = p_trans_id
      for update;

      if not found then
        raise exception 'duplicate_lookup_failed';
      end if;

      if v_tx.user_id <> p_user_id
         or v_tx.reward_units <> p_reward_units then
        raise exception 'transaction_id_conflict';
      end if;

      return jsonb_build_object('result', 'duplicate');
    end if;

    -- Check whether a reversal arrived before this reward.
    select *
    into v_pending
    from public.offerwall_pending_reversals
    where trans_id = p_trans_id
    for update;

    if found then
      if v_pending.user_id <> p_user_id
         or v_pending.reward_units <> p_reward_units then
        raise exception 'pending_reversal_mismatch';
      end if;

      if v_pending.status = 'pending' then
        update public.offerwall_pending_reversals
        set status = 'applied',
            applied_at = now()
        where id = v_pending.id;

        update public.offerwall_transactions
        set provider_status = '2',
            status = 'reversed',
            reversed_at = now()
        where id = v_tx.id;

        return jsonb_build_object(
          'result', 'reversed_before_credit',
          'credited_tokens', 0,
          'trans_id', p_trans_id
        );
      end if;

      -- An already applied pending reversal must not be credited.
      update public.offerwall_transactions
      set provider_status = '2',
          status = 'reversed',
          reversed_at = coalesce(reversed_at, now())
      where id = v_tx.id;

      return jsonb_build_object(
        'result', 'already_reversed',
        'credited_tokens', 0
      );
    end if;

    -- Repay outstanding reversal debts before crediting.
    v_remaining := v_user_tokens;

    for v_debt in
      select *
      from public.offerwall_reversal_debts
      where user_id = p_user_id
        and status = 'pending'
        and remaining_tokens > 0
      order by created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      v_pay := least(v_remaining, v_debt.remaining_tokens);
      v_new_remaining := v_debt.remaining_tokens - v_pay;
      v_remaining := v_remaining - v_pay;

      if v_new_remaining = 0 then
        update public.offerwall_reversal_debts
        set remaining_tokens = 0,
            status = 'settled',
            settled_at = now()
        where id = v_debt.id;

        update public.offerwall_transactions
        set status = 'reversed',
            reversed_at = coalesce(reversed_at, now())
        where id = v_debt.transaction_id;
      else
        update public.offerwall_reversal_debts
        set remaining_tokens = v_new_remaining
        where id = v_debt.id;
      end if;
    end loop;

    if v_remaining > 0 then
      perform public.credit_wallet(
        p_user_id,
        v_remaining,
        'offerwall_reward',
        'Verified Offerwall reward',
        'offerwall',
        v_tx.id,
        'offerwall:' || p_trans_id,
        jsonb_build_object(
          'trans_id', p_trans_id,
          'provider_reward_units', p_reward_units,
          'user_share_percent', 20
        )
      );
    end if;

    return jsonb_build_object(
      'result', 'credited',
      'user_tokens', v_user_tokens,
      'wallet_tokens', v_remaining,
      'repaid_tokens', v_user_tokens - v_remaining
    );
  end if;

  -- STATUS 2: reversal / chargeback.
  select *
  into v_tx
  from public.offerwall_transactions
  where trans_id = p_trans_id
  for update;

  -- Original reward has not arrived: store the reversal.
  if not found then
    insert into public.offerwall_pending_reversals (
      trans_id,
      user_id,
      reward_units,
      payout_usd,
      offer_name,
      offer_type,
      metadata
    )
    values (
      p_trans_id,
      p_user_id,
      p_reward_units,
      p_payout_usd,
      p_offer_name,
      p_offer_type,
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (trans_id) do nothing;

    select *
    into v_pending
    from public.offerwall_pending_reversals
    where trans_id = p_trans_id
    for update;

    if not found then
      raise exception 'pending_reversal_save_failed';
    end if;

    if v_pending.user_id <> p_user_id
       or v_pending.reward_units <> p_reward_units then
      raise exception 'pending_reversal_conflict';
    end if;

    return jsonb_build_object(
      'result', 'pending_reversal_recorded',
      'trans_id', p_trans_id
    );
  end if;

  if v_tx.user_id <> p_user_id then
    raise exception 'transaction_user_mismatch';
  end if;

  if v_tx.reward_units <> p_reward_units then
    raise exception 'reversal_reward_mismatch';
  end if;

  if v_tx.status in ('reversed', 'reversal_pending')
     or v_tx.provider_status = '2' then
    return jsonb_build_object('result', 'duplicate_reversal');
  end if;

  -- Deduct available balance; unpaid amount becomes debt.
  v_pay := least(v_balance, v_tx.user_tokens);
  v_remaining := v_tx.user_tokens - v_pay;

  if v_pay > 0 then
    perform public.credit_wallet(
      p_user_id,
      -v_pay,
      'offerwall_reversal',
      'Offerwall reward reversal',
      'offerwall',
      v_tx.id,
      'offerwall-reversal:' || p_trans_id,
      jsonb_build_object('trans_id', p_trans_id)
    );
  end if;

  if v_remaining > 0 then
    insert into public.offerwall_reversal_debts (
      transaction_id,
      user_id,
      original_tokens,
      remaining_tokens,
      status
    )
    values (
      v_tx.id,
      p_user_id,
      v_tx.user_tokens,
      v_remaining,
      'pending'
    )
    on conflict (transaction_id) do nothing;
  end if;

  update public.offerwall_transactions
  set provider_status = '2',
      status = case
        when v_remaining = 0 then 'reversed'
        else 'reversal_pending'
      end,
      reversed_at = now()
  where id = v_tx.id;

  return jsonb_build_object(
    'result',
    case
      when v_remaining = 0 then 'reversed'
      else 'reversal_pending'
    end,
    'deducted_tokens', v_pay,
    'debt_tokens', v_remaining
  );
end;
$$;

revoke all on public.offerwall_pending_reversals
from public, anon, authenticated;

revoke all on function public.process_offerwall_transaction(
  text, uuid, bigint, numeric, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.process_offerwall_transaction(
  text, uuid, bigint, numeric, text, text, text, jsonb
) to service_role;

commit;
