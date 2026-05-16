-- Corrects the entry-materialization trigger from 20260516030000.
-- The lead_status enum has 'quoted'/'advanced' labels, but the
-- leads_status_check constraint only permits: partial, new, contacted,
-- interested, qualified, closed_won, closed_lost. So the original trigger
-- (keyed on 'quoted'/'advanced') would effectively never fire.
--
-- The real "serious quote" signals in this codebase are:
--   1. lead reaches 'qualified' or 'closed_won' status, and
--   2. an actual lead_quotes record is created for the lead.
-- Both paths call the idempotent materializer; the partial unique index
-- keeps the same lead from being double-counted.

CREATE OR REPLACE FUNCTION public.trg_leads_referral_materialize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('qualified', 'closed_won')
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.referred_by_referrer_id IS DISTINCT FROM NEW.referred_by_referrer_id
     ) THEN
    PERFORM public.materialize_referral_entries(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Literal "a quote was produced" signal.
CREATE OR REPLACE FUNCTION public.trg_lead_quotes_referral_materialize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.materialize_referral_entries(NEW.lead_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_lead_quotes_referral_materialize()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lead_quotes_referral_materialize ON public.lead_quotes;
CREATE TRIGGER trg_lead_quotes_referral_materialize
  AFTER INSERT ON public.lead_quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_lead_quotes_referral_materialize();
