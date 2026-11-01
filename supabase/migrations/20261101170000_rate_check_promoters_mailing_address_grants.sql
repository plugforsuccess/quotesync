-- rate_check_promoters uses column-level grants for staff writes; the mailing-address
-- columns (20261101160000) were added without them, so Add partner with an address
-- failed with "permission denied for table rate_check_promoters". Applied 2026-11-01.
grant insert (mailing_address, mailing_city_state_zip), update (mailing_address, mailing_city_state_zip)
  on public.rate_check_promoters to authenticated;

NOTIFY pgrst, 'reload schema';
