create or replace function public.start_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks;
  v_done int;
  v_open public.task_completions;
  v_id uuid;
  v_click uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not coalesce(
    (select is_active from public.profiles where id = v_uid),
    false
  ) then
    raise exception 'account_inactive';
  end if;

  -- Serialize simultaneous starts for this user and task.
  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_task_id::text, 0)
  );

  select * into v_task
  from public.tasks
  where id = p_task_id and is_active;

  if not found then
    raise exception 'task_unavailable';
  end if;

  select count(*) into v_done
  from public.task_completions
  where user_id = v_uid
    and task_id = p_task_id
    and status = 'completed';

  if v_done >= coalesce(v_task.max_completions_per_user, 1) then
    raise exception 'task_limit_reached';
  end if;

  select * into v_open
  from public.task_completions
  where user_id = v_uid
    and task_id = p_task_id
    and status = 'started'
    and started_at > now() - interval '7 days'
  order by started_at desc
  limit 1;

  if found then
    v_click := v_open.click_id;
  else
    insert into public.task_completions (user_id, task_id, status)
    values (v_uid, p_task_id, 'started')
    returning id, click_id into v_id, v_click;
  end if;

  return jsonb_build_object(
    'click_id', v_click,
    'action_url',
      case
        when v_task.action_url is null then null
        else replace(v_task.action_url, '{click_id}', v_click::text)
      end
  );
end
$function$;