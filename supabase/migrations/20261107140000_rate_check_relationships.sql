-- Rate Check contact step: whose policy it is, and how the person filling it in relates
-- to them and to the partner who shared the link. "Other" is typed (40 characters) and
-- normalized before it's saved ("my cousin!!" → "Cousin").
alter table public.rate_checks add column if not exists policyholder_name text;
alter table public.rate_checks add column if not exists contact_relationship text
  check (contact_relationship in ('self', 'spouse', 'domestic_partner', 'parent', 'child', 'household', 'other'));
alter table public.rate_checks add column if not exists contact_relationship_other text check (char_length(contact_relationship_other) <= 40);
alter table public.rate_checks add column if not exists referrer_relationship text
  check (referrer_relationship in ('friend', 'family', 'coworker', 'client', 'other'));
alter table public.rate_checks add column if not exists referrer_relationship_other text check (char_length(referrer_relationship_other) <= 40);

NOTIFY pgrst, 'reload schema';
