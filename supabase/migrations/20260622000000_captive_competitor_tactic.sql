-- Captive agencies (Allstate) can't price-match a competitor. Reframe the
-- 'competitor_match' tactic from "Matched competitor quote" to "Held vs.
-- competitor quote": the customer had an outside quote and we retained them on
-- Allstate value, optionally logging the competitor + their price as churn intel
-- (often unknown — customers don't always share it). The code is left unchanged
-- so existing captured interventions and the save_method mapping still resolve.

UPDATE public.intervention_types
SET display_name = 'Held vs. competitor quote',
    description  = 'Customer had a quote elsewhere — retained on Allstate value/coverage, not by price-matching (we are captive). Log the competitor and their price if shared.'
WHERE code = 'competitor_match';
