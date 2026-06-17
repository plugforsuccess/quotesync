-- Expand service_tasks.task_type allowed values to match the UI TASK_TYPES list
-- (added: driver, payment, insurance_review, reinstatement, terminate, claim).
-- Without this, picking one of the new types failed the check constraint on insert.
alter table public.service_tasks drop constraint if exists service_tasks_task_type_check;
alter table public.service_tasks add constraint service_tasks_task_type_check
  check (task_type = any (array[
    'mortgagee','vehicle','driver','billing','payment','address',
    'premium','coverage','insurance_review','reinstatement','terminate',
    'claim','id_cards','document','other'
  ]::text[]));
