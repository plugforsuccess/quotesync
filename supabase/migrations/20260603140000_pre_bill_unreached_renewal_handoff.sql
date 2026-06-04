-- Pre-bill human handoff for un-reached renewal cases.
-- Allstate posts renewals at 45 days out; the insured is billed at 21 days out.
-- Bland AI works >5% increases proactively in the 45->21 window. Any >5% case
-- the AI has NOT saved/confirmed by ~24 days out (a 3-day buffer before the
-- bill) is escalated to a human so a licensed rep can call before the bill
-- lands and the customer experiences rate shock. Nothing fires when a case
-- crosses a date threshold, so this runs as a daily sweep.
create or replace function public.flag_unreached_pre_bill_renewals()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update renewal_cases rc
     set human_followup_required = true,
         followup_reason = 'unreached_pre_bill',
         followup_due_by = (rc.renewal_date - 21),  -- the bill date
         updated_at = now()
   where rc.status in ('pending', 'attempting')
     and coalesce(rc.human_only, false) = false
     and coalesce(rc.human_followup_required, false) = false
     and coalesce(rc.premium_change_pct, 0) > 5      -- only meaningful rate increases
     and rc.renewal_date is not null
     and rc.renewal_date >= current_date             -- not already past renewal
     and (rc.renewal_date - current_date) <= 24;     -- within 3 days of the 21-day bill
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.flag_unreached_pre_bill_renewals() from public;

-- Daily at 12:00 UTC (~7-8am ET) — flags the day's freshly-at-risk cases each
-- morning so reps see them at the top of the queue before the bill.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'flag-unreached-pre-bill-renewals';

select cron.schedule(
  'flag-unreached-pre-bill-renewals',
  '0 12 * * *',
  $$ select public.flag_unreached_pre_bill_renewals(); $$
);
