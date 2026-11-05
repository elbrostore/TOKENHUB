begin;

alter table public.task_completions
  drop constraint if exists task_completions_status_check;

alter table public.task_completions
  add constraint task_completions_status_check
  check (status in ('started', 'completed', 'rejected', 'expired'))
  not valid;

alter table public.task_completions
  validate constraint task_completions_status_check;

commit;