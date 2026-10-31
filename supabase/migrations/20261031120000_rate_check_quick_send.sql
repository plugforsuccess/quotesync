-- Quick Send: a producer texts a dec-page upload link from the agency's number while
-- talking to someone, from /qs — without being logged in. The page identifies the
-- producer by a key saved on a phone they set up once (rate_check_qs_devices), or by
-- their time-clock PIN on a borrowed phone, which gets a key that lasts one shift
-- (PIN tries are rate limited with rate_limit_hit). Sends are rate_check_invites rows with
-- source 'quick_send' plus the proof the person asked and the Twilio delivery status.
-- All writes go through the rate-check-quick-send edge function (service role).
--
-- Also: the Rate Check text-message box is now optional; rate_checks.sms_consent keeps
-- the decision (opted_in / declined). consent_given_at is still only set on opt-in.

-- ── Phones set up for Quick Send ────────────────────────────────────────────
create table if not exists public.rate_check_qs_devices (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references public.agencies(id) on delete cascade,
  user_id       uuid not null,
  producer_name text,
  label         text,
  key_hash      text not null unique,           -- sha256 of the key kept on the phone
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,                     -- set for a PIN sign-in (one shift); null for a set-up phone
  revoked_at    timestamptz
);
create index if not exists rate_check_qs_devices_agency_idx on public.rate_check_qs_devices (agency_id, created_at desc);

alter table public.rate_check_qs_devices enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_qs_devices' and policyname = 'rate_check_qs_devices_select') then
    create policy rate_check_qs_devices_select on public.rate_check_qs_devices
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  -- Anyone in the agency can remove a phone (a lost phone shouldn't wait for the owner).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_qs_devices' and policyname = 'rate_check_qs_devices_update') then
    create policy rate_check_qs_devices_update on public.rate_check_qs_devices
      for update to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end $$;

revoke all on public.rate_check_qs_devices from anon;
revoke all on public.rate_check_qs_devices from authenticated;
grant select (id, agency_id, user_id, producer_name, label, created_at, last_used_at, expires_at, revoked_at) on public.rate_check_qs_devices to authenticated;
grant update (revoked_at) on public.rate_check_qs_devices to authenticated;

-- ── Quick Send fields on invites ────────────────────────────────────────────
alter table public.rate_check_invites
  add column if not exists source         text not null default 'link',
  add column if not exists request_id     uuid,          -- the page's id for one Send press (no double texts)
  add column if not exists attested_at    timestamptz,   -- producer pressed "Send Requested DEC Link"
  add column if not exists script_version text,
  add column if not exists message_version text,
  add column if not exists device_id      uuid references public.rate_check_qs_devices(id) on delete set null,
  add column if not exists sent_with_pin  boolean not null default false,
  add column if not exists sms_sid        text,
  add column if not exists sms_status     text,          -- requested | queued | sent | delivered | failed | blocked
  add column if not exists sms_status_at  timestamptz,
  add column if not exists sms_error      text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_check_invites_source_check') then
    alter table public.rate_check_invites add constraint rate_check_invites_source_check check (source in ('link', 'quick_send'));
  end if;
end $$;
create unique index if not exists rate_check_invites_request_idx on public.rate_check_invites (request_id) where request_id is not null;
create index if not exists rate_check_invites_sms_sid_idx on public.rate_check_invites (sms_sid) where sms_sid is not null;
create index if not exists rate_check_invites_qs_phone_idx on public.rate_check_invites (agency_id, phone, created_at desc) where source = 'quick_send';

-- ── On/off switch (off until the agency turns it on) ────────────────────────
alter table public.agencies
  add column if not exists quick_send_enabled boolean not null default false;

-- ── The scanner's optional text box: the decision either way ────────────────
alter table public.rate_checks
  add column if not exists sms_consent text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_checks_sms_consent_check') then
    alter table public.rate_checks add constraint rate_checks_sms_consent_check check (sms_consent is null or sms_consent in ('opted_in', 'declined'));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
