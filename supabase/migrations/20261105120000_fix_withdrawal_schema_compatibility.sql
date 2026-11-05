begin;

create or replace function public.request_withdrawal(
  p_amount bigint,
  p_method text,
  p_destination text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_min bigint;
  v_id uuid;
  v_dest text := trim(coalesce(p_destination, ''));
  v_method text := lower(trim(coalesce(p_method, '')));
  v_db_method text;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select is_active
  into v_active
  from public.profiles
  where id = v_uid
  for update;

  if not coalesce(v_active, false) then
    raise exception 'account_inactive';
  end if;

  v_min := public.get_setting_int('min_withdrawal_tokens', 1000);

  if p_amount is null or p_amount < v_min then
    raise exception 'below_minimum:%', v_min;
  end if;

  if not exists (
    select 1
    from public.app_settings
    where key = 'payout_methods'
      and value ? v_method
  ) then
    raise exception 'unsupported_method';
  end if;

  if char_length(v_dest) < 3 or char_length(v_dest) > 200 then
    raise exception 'invalid_destination';
  end if;

  v_db_method := case
    when v_method = 'usdt_trc20' then 'usdt'
    else v_method
  end;

  if v_db_method not in ('paypal', 'usdt', 'bank_transfer', 'manual') then
    raise exception 'unsupported_method';
  end if;

  if (
    select count(*)
    from public.withdrawal_requests
    where user_id = v_uid
      and status = 'pending'
  ) >= 3 then
    raise exception 'too_many_pending';
  end if;

  insert into public.withdrawal_requests (
    user_id,
    amount,
    method,
    destination,
    amount_tokens,
    payout_method,
    payout_details,
    status
  )
  values (
    v_uid,
    p_amount,
    v_method,
    v_dest,
    p_amount,
    v_db_method,
    jsonb_build_object(
      'destination', v_dest,
      'requested_method', v_method
    ),
    'pending'
  )
  returning id into v_id;

  perform public.credit_wallet(
    v_uid,
    -p_amount,
    'withdrawal',
    'Withdrawal request (' || v_method || ')',
    'withdrawal_request',
    v_id,
    'withdrawal:' || v_id
  );

  insert into public.notifications (user_id, type, title, body)
  values (
    v_uid,
    'withdrawal',
    'Withdrawal requested',
    p_amount || ' tokens are on hold while your request is reviewed.'
  );

  return v_id;
end;
$function$;

commit;