-- Producers recruit Rate Check partners (Schedule B: 2 activated partners a month).
--
--   agency_memberships.recruit_code   each team member's "Become a Partner" link code:
--                                     /courses?by=CODE#partners. Someone who applies
--                                     through it is credited to that producer.
--   rate_check_partner_applications.recruited_by   who the applicant came through.
--   rate_check_promoters.recruited_by              the producer credited with the partner
--                                                  (carried over when the application is
--                                                  approved). Households the partner sends
--                                                  are credited to this producer too.
--   producer_floor_settings.partners_floor         activated partners a producer owes a
--                                                  month (default 2).
--
-- "Activated" (counted in the app, not stored): the partner signed the Rate Check partner
-- agreement AND sent at least one qualified household. It counts in the month the later
-- of the two happened, so signing up friends who never send anyone doesn't count.
--
-- Partners added before this rule are credited to the agency principal (Cam).

alter table public.agency_memberships
  add column if not exists recruit_code text unique default public.rc_invite_code();
update public.agency_memberships set recruit_code = public.rc_invite_code() where recruit_code is null;
grant select (recruit_code) on public.agency_memberships to authenticated;

alter table public.rate_check_partner_applications
  add column if not exists recruited_by uuid references auth.users(id) on delete set null;
grant select (recruited_by) on public.rate_check_partner_applications to authenticated;

alter table public.rate_check_promoters
  add column if not exists recruited_by uuid references auth.users(id) on delete set null;
grant insert (recruited_by), update (recruited_by) on public.rate_check_promoters to authenticated;
create index if not exists rate_check_promoters_recruited_by_idx on public.rate_check_promoters (recruited_by) where recruited_by is not null;

update public.rate_check_promoters p set recruited_by = (
  select m.user_id from public.agency_memberships m
  where m.agency_id = p.agency_id and m.status = 'active' and m.agency_role = 'principal'
  order by m.created_at limit 1)
where p.recruited_by is null;

alter table public.producer_floor_settings
  add column if not exists partners_floor integer not null default 2 check (partners_floor >= 0);

NOTIFY pgrst, 'reload schema';
