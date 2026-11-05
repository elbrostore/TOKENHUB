
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount bigint,
  p_method text,
  p_destination text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_min bigint;
  v_id uuid;
  v_dest text := trim(coalesce(p_destination, ''));
  v_active boolean;
BEGIN
  -- Authentication check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Lock the user's profile to prevent concurrent withdrawal requests
  SELECT is_active
  INTO v_active
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT coalesce(v_active, false) THEN
    RAISE EXCEPTION 'account_inactive';
  END IF;

  -- Minimum withdrawal amount
  v_min := public.get_setting_int('min_withdrawal_tokens', 1000);

  IF p_amount IS NULL OR p_amount < v_min THEN
    RAISE EXCEPTION 'below_minimum:%', v_min;
  END IF;

  -- Validate payout method
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_settings
    WHERE key = 'payout_methods'
      AND value ? p_method
  ) THEN
    RAISE EXCEPTION 'unsupported_method';
  END IF;

  -- Validate destination
  IF char_length(v_dest) < 3 OR char_length(v_dest) > 200 THEN
    RAISE EXCEPTION 'invalid_destination';
  END IF;

  -- Maximum three pending withdrawals per user
  IF (
    SELECT count(*)
    FROM public.withdrawal_requests
    WHERE user_id = v_uid
      AND status = 'pending'
  ) >= 3 THEN
    RAISE EXCEPTION 'too_many_pending';
  END IF;

  -- Create withdrawal request
  INSERT INTO public.withdrawal_requests
    (user_id, amount, method, destination, status)
  VALUES
    (v_uid, p_amount, p_method, v_dest, 'pending')
  RETURNING id INTO v_id;

  -- Deduct tokens atomically
  PERFORM public.credit_wallet(
    v_uid,
    -p_amount,
    'withdrawal',
    'Withdrawal request (' || p_method || ')',
    'withdrawal_request',
    v_id,
    'withdrawal:' || v_id
  );

  -- Notify user
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    v_uid,
    'withdrawal',
    'Withdrawal requested',
    p_amount || ' tokens are on hold while your request is reviewed.'
  );

  RETURN v_id;
END;
$function$;
