-- Rate Check: staff can upload a dec page on a customer's behalf (emailed or
-- texted in) from the Rate Checks inbox. Those rows carry no consumer consent,
-- so rate-check-outcome must not auto-text them.
alter table public.rate_checks
  add column if not exists upload_source text not null default 'consumer',
  add column if not exists uploaded_by uuid references auth.users(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_checks_upload_source_check') then
    alter table public.rate_checks add constraint rate_checks_upload_source_check
      check (upload_source in ('consumer', 'agent'));
  end if;
end
$$;

NOTIFY pgrst, 'reload schema';
