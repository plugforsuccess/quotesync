-- Rate Check: keep the full policy number (not just last 4) and record where
-- the policy term came from, so a 6- vs 12-month auto term is never a silent
-- guess. Full VINs live in rate_checks.vehicles[].vin (jsonb, no DDL needed).
--
-- term_source:
--   dates            — derived from the printed effective → expiration dates
--   printed          — term length printed on the page ("6 months")
--   carrier_default  — not on the page; the carrier's usual auto term was used
--   line_default     — home / renters / condo / umbrella are annual
--   agent            — corrected by an agent in the Rate Checks inbox
--   unknown          — nothing to go on; premium treated as annual (low confidence)
alter table public.rate_checks
  add column if not exists policy_number text,
  add column if not exists term_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_checks_term_source_check') then
    alter table public.rate_checks add constraint rate_checks_term_source_check
      check (term_source in ('dates', 'printed', 'carrier_default', 'line_default', 'agent', 'unknown'));
  end if;
end
$$;

NOTIFY pgrst, 'reload schema';
