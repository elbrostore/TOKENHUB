
begin;

-- 1. Track the exact split of every Offerwall reward.
alter table public.offerwall_transactions
  add column if not exists wallet_tokens bigint not null default 0,
  add column if not exists repaid_tokens bigint not null default 0;

-- 2. Record which old debts were repaid by each new reward.
create table if not exists public.offerwall_debt_repayments (
  id uuid primary key default gen_random_uuid(),
  reward_transaction_id uuid not null
    references public.offerwall_transactions(id) on delete restrict,
  debt_transaction_id uuid not null
    references public.offerwall_transactions(id) on delete restrict,
  amount bigint not null check (amount > 0),
  restored_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reward_transaction_id, debt_transaction_id),
  check (reward_transaction_id <> debt_transaction_id)
);

create index if not exists offerwall_debt_repayments_debt_idx
  on public.offerwall_debt_repayments(debt_transaction_id);

alter table public.offerwall_debt_repayments enable row level security;

revoke all on public.offerwall_debt_repayments
  from public, anon, authenticated;

-- 3. Replace the processor with accurate reward/reversal accounting.
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
  v_wallet_tokens bigint;
  v_repaid_tokens bigint;
  v_remaining bigint;
  v_debt record;
  v_pay bigint;
  v_new_remaining bigint;
  v_reversed_wallet_tokens bigint;
  v_restored_tokens bigint := 0;
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

  if p_status is null or p_status not in ('1', '2') then
    raise exception 'invalid_provider_status';
  end if;

  if p_payout_usd is null or p_payout_usd < 0 then
    raise exception 'invalid_payout';
  end if;

  -- Serialize all operations for this user's wallet.
  select balance
  into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- STATUS 1: new reward.
  if p_status = '1' then
    v_user_tokens := floor(p_reward_units::numeric * 0.20)::bigint;

    if v_user_tokens <= 0 then
      raise exception 'reward_below_minimum';
    end if;

    insert into public.offerwall_transactions (
      trans_id, user_id, offer_name, offer_type,
      reward_units, payout_usd, user_tokens,
      wallet_tokens, repaid_tokens,
      status, provider_status, metadata
    )
    values (
      p_trans_id, p_user_id, p_offer_name, p_offer_type,
      p_reward_units, p_payout_usd, v_user_tokens,
      0, 0,
      'credited', '1', coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (trans_id) do nothing
    returning * into v_tx;

    -- Duplicate callbacks must never credit twice.
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

    -- A reversal may arrive before its original reward.
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

      update public.offerwall_pending_reversals
      set status = 'applied',
          applied_at = now()
      where id = v_pending.id
        and status = 'pending';

      update public.offerwall_transactions
      set provider_status = '2',
          status = 'reversed',
          wallet_tokens = 0,
          repaid_tokens = 0,
          reversed_at = now()
      where id = v_tx.id;

      return jsonb_build_object(
        'result', 'reversed_before_credit',
        'credited_tokens', 0,
        'trans_id', p_trans_id
      );
    end if;

    -- Repay old debts and record each allocation.
    v_remaining := v_user_tokens;

    for v_debt in
      select d.*
      from public.offerwall_reversal_debts d
      where d.user_id = p_user_id
        and d.status = 'pending'
        and d.remaining_tokens > 0
      order by d.created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      v_pay := least(v_remaining, v_debt.remaining_tokens);
      v_new_remaining := v_debt.remaining_tokens - v_pay;
      v_remaining := v_remaining - v_pay;

      insert into public.offerwall_debt_repayments (
        reward_transaction_id,
        debt_transaction_id,
        amount
      )
      values (v_tx.id, v_debt.transaction_id, v_pay);

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

    v_wallet_tokens := v_remaining;
    v_repaid_tokens := v_user_tokens - v_wallet_tokens;

    update public.offerwall_transactions
    set wallet_tokens = v_wallet_tokens,
        repaid_tokens = v_repaid_tokens
    where id = v_tx.id;

    if v_wallet_tokens > 0 then
      perform public.credit_wallet(
        p_user_id,
        v_wallet_tokens,
        'offerwall_reward',
        'Verified Offerwall reward',
        'offerwall',
        v_tx.id,
        'offerwall:' || p_trans_id,
        jsonb_build_object(
          'trans_id', p_trans_id,
          'provider_reward_units', p_reward_units,
          'user_share_percent', 20,
          'repaid_tokens', v_repaid_tokens
        )
      );
    end if;

    return jsonb_build_object(
      'result', 'credited',
      'user_tokens', v_user_tokens,
      'wallet_tokens', v_wallet_tokens,
      'repaid_tokens', v_repaid_tokens
    );
  end if;

  -- STATUS 2: chargeback / reversal.
  select *
  into v_tx
  from public.offerwall_transactions
  where trans_id = p_trans_id
  for update;

  -- Reversal received before the original reward.
  if not found then
    insert into public.offerwall_pending_reversals (
      trans_id, user_id, reward_units, payout_usd,
      offer_name, offer_type, metadata
    )
    values (
      p_trans_id, p_user_id, p_reward_units, p_payout_usd,
      p_offer_name, p_offer_type, coalesce(p_payload, '{}'::jsonb)
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

  -- Restore debts that this reward previously repaid.
  for v_debt in
    select r.id as repayment_id,
           r.amount,
           r.debt_transaction_id,
           d.id as debt_id,
           d.remaining_tokens,
           d.original_tokens
    from public.offerwall_debt_repayments r
    join public.offerwall_reversal_debts d
      on d.transaction_id = r.debt_transaction_id
    where r.reward_transaction_id = v_tx.id
      and r.restored_at is null
    order by r.created_at
    for update of r, d
  loop
    update public.offerwall_reversal_debts
    set remaining_tokens = remaining_tokens + v_debt.amount,
        status = 'pending',
        settled_at = null
    where id = v_debt.debt_id;

    update public.offerwall_transactions
    set status = 'reversal_pending'
    where id = v_debt.debt_transaction_id;

    update public.offerwall_debt_repayments
    set restored_at = now()
    where id = v_debt.repayment_id;

    v_restored_tokens := v_restored_tokens + v_debt.amount;
  end loop;

  -- Only claw back tokens that actually entered the wallet.
  v_reversed_wallet_tokens := coalesce(v_tx.wallet_tokens, 0);
  v_pay := least(v_balance, v_reversed_wallet_tokens);
  v_remaining := v_reversed_wallet_tokens - v_pay;

  if v_pay > 0 then
    perform public.credit_wallet(
      p_user_id,
      -v_pay,
      'offerwall_reversal',
      'Offerwall reward reversal',
      'offerwall',
      v_tx.id,
      'offerwall-reversal:' || p_trans_id,
      jsonb_build_object(
        'trans_id', p_trans_id,
        'restored_old_debts', v_restored_tokens
      )
    );
  end if;

  -- Any amount no longer available becomes a debt.
  if v_remaining > 0 then
    insert into public.offerwall_reversal_debts (
      transaction_id, user_id, original_tokens,
      remaining_tokens, status
    )
    values (
      v_tx.id, p_user_id, v_reversed_wallet_tokens,
      v_remaining, 'pending'
    )
    on conflict (transaction_id) do update
    set original_tokens = excluded.original_tokens,
        remaining_tokens = excluded.remaining_tokens,
        status = 'pending',
        settled_at = null;
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
    'debt_tokens', v_remaining,
    'restored_old_debts', v_restored_tokens
  );
end;
$$;

revoke all on function public.process_offerwall_transaction(
  text, uuid, bigint, numeric, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.process_offerwall_transaction(
  text, uuid, bigint, numeric, text, text, text, jsonb
) to service_role;

commit;
