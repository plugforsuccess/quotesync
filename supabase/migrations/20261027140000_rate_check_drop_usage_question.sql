-- Rate Checks: stop asking "Who drives each car, and how far" — the agency doesn't
-- need vehicle usage to quote. Removes it from rate_check_decide (edited in place so
-- the rest of the function stays exactly as deployed) and from existing scans.

do $$
declare
  def text := pg_get_functiondef('public.rate_check_decide(public.rate_checks)'::regprocedure);
begin
  def := replace(def, $q$    if not has_usage then questions := questions || '"Who drives each car, and how far"'::jsonb; end if;
$q$, '');
  if position('Who drives each car' in def) > 0 then
    raise exception 'rate_check_decide still asks about usage; not changed';
  end if;
  execute def;
end $$;

update public.rate_checks
   set decision_questions = decision_questions - 'Who drives each car, and how far'
 where decision_questions ? 'Who drives each car, and how far';
