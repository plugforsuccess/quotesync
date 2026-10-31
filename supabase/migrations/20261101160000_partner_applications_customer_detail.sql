-- Partner applications: "Are you an Allstate customer?" and, if yes, "Is Cam Wiley Agency
-- your agent?" → agency | allstate_other | allstate_unsure | no ('yes' kept for older rows).

alter table public.rate_check_partner_applications drop constraint if exists rate_check_partner_applications_is_customer_check;
alter table public.rate_check_partner_applications add constraint rate_check_partner_applications_is_customer_check
  check (is_customer is null or is_customer in ('agency', 'allstate_other', 'allstate_unsure', 'no', 'yes'));

NOTIFY pgrst, 'reload schema';
