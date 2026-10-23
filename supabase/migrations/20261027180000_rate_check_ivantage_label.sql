-- Rate Checks: the expanded_market outcome is called "Ivantage" in the app. The one
-- place rate_check_decide spells it out in text gets the same name (the decision
-- value stays expanded_market).

do $$
declare
  def text := pg_get_functiondef('public.rate_check_decide(public.rate_checks)'::regprocedure);
begin
  def := replace(def, 'Needed to tell Allstate from expanded market.', 'Needed to tell Allstate from Ivantage.');
  if position('xpanded market' in def) > 0 then
    raise exception 'rate_check_decide still says expanded market; not changed';
  end if;
  execute def;
end $$;

update public.rate_checks
   set decision_reasons = replace(decision_reasons::text, 'Needed to tell Allstate from expanded market.', 'Needed to tell Allstate from Ivantage.')::jsonb
 where decision_reasons::text like '%Needed to tell Allstate from expanded market.%';
