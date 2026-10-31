-- Quick Send is always on (no agency switch), and the time-clock PIN is now the
-- Quick Send PIN: it identifies one producer, so no two active employees may share one.

alter table public.agencies drop column if exists quick_send_enabled;

create unique index if not exists employees_punch_pin_unique
  on public.employees (punch_pin)
  where punch_pin is not null and employment_status = 'active';

NOTIFY pgrst, 'reload schema';
