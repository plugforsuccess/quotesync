-- Texting through Telnyx: everyone who has texted STOP to the agency number, lead or not.
-- Every send checks it (Quick Send, Send Text, the upload form's code). START sets
-- opted_in_at, which lets them be texted again. Written only by edge functions.

create table if not exists public.sms_opt_outs (
  phone        text primary key check (phone ~ '^\d{10}$'),
  opted_out_at timestamptz not null default now(),
  opted_in_at  timestamptz,
  source       text
);

alter table public.sms_opt_outs enable row level security;

-- Staff can see who opted out (to know not to text them from their own phone either).
create policy sms_opt_outs_select on public.sms_opt_outs
  for select to authenticated
  using (exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.status = 'active'));

-- Anyone who already texted STOP as a lead stays opted out.
insert into public.sms_opt_outs (phone, source)
select distinct phone, 'lead_flag' from public.leads
 where sms_opted_out and phone ~ '^\d{10}$'
on conflict (phone) do nothing;

NOTIFY pgrst, 'reload schema';
