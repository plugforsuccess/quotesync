-- Landlord policies: read and saved as their own type (they were saved as 'other'),
-- and a Landlord row on the partner pay schedule. Landlord is counted on its own:
-- its fee is paid on top of whatever else the household sends.
alter table public.rate_checks drop constraint if exists rate_checks_policy_type_check;
alter table public.rate_checks add constraint rate_checks_policy_type_check
  check (policy_type in ('auto','home','renters','condo','landlord','umbrella','commercial_auto','commercial','other'));

alter table public.rate_check_promoter_rates drop constraint if exists rate_check_promoter_rates_tier_check;
alter table public.rate_check_promoter_rates add constraint rate_check_promoter_rates_tier_check
  check (tier in ('auto_home','auto_renters','home_only','auto_only','renters_only','landlord','extra_line'));

NOTIFY pgrst, 'reload schema';
