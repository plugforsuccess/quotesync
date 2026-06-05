-- ============================================================================
-- Split "Insured Request — All Other" out of Other/Uncategorized
-- ============================================================================
-- ~42% of lapses arrive coded "Insured's Request - All Other" — a default
-- staff pick that hides the true reason. It is NOT generic "uncategorized"; it
-- is voluntary churn with the reason not captured, and it's likely winnable.
-- Giving it its own (partial) category makes the procedure gap measurable.
-- ============================================================================

INSERT INTO public.termination_reason_categories
  (code, display_name, description, action_class, color_token, sort_order)
VALUES
  ('insured_request_unspecified', 'Insured Request (Unspecified)',
   'Insured requested cancellation with no specific reason recorded ("All Other"). A data-capture gap — likely winnable churn hiding behind a default code. Capture the true reason at cancellation.',
   'partial', '#FB923C', 16)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.categorize_termination_reason(
  p_agency_id UUID,
  p_raw_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _category_id UUID;
  _normalized  TEXT;
  _code        TEXT;
BEGIN
  IF p_raw_reason IS NULL OR trim(p_raw_reason) = '' THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'other';
    RETURN _category_id;
  END IF;

  _normalized := lower(trim(p_raw_reason));

  SELECT c.id INTO _category_id
  FROM termination_reason_aliases a
  JOIN termination_reason_categories c ON c.code = a.category_code
  WHERE a.agency_id = p_agency_id
    AND lower(a.raw_reason) = _normalized
  LIMIT 1;
  IF _category_id IS NOT NULL THEN
    RETURN _category_id;
  END IF;

  IF _normalized LIKE '%void%'
     OR _normalized LIKE '%first payment%' OR _normalized LIKE '%1st payment%'
     OR _normalized LIKE '%initial payment%' OR _normalized LIKE '%down payment%' THEN
    _code := 'first_payment_failure';
  ELSIF _normalized LIKE '%duplicate%' THEN
    _code := 'duplicate_coverage';
  ELSIF _normalized LIKE '%total loss%' THEN
    _code := 'total_loss';
  ELSIF _normalized LIKE '%property with allstate%' OR _normalized LIKE '%new property with allstate%' THEN
    _code := 'rewritten';
  ELSIF _normalized LIKE '%another policy%' OR _normalized LIKE '%rewrit%'
        OR _normalized LIKE '%re-writ%' OR _normalized LIKE '%internal%' THEN
    _code := 'rewritten';
  ELSIF _normalized LIKE '%new owner%' THEN
    _code := 'asset_sold';
  ELSIF _normalized LIKE '%moved%' OR _normalized LIKE '%relocat%'
        OR _normalized LIKE '%out of state%' THEN
    _code := 'moved';
  ELSIF _normalized LIKE '%sold%' OR _normalized LIKE '%no longer own%'
        OR _normalized LIKE '%traded%' THEN
    _code := 'asset_sold';
  ELSIF _normalized LIKE '%claim settlement%'
        OR (_normalized LIKE '%claim%' AND _normalized LIKE '%settle%') THEN
    _code := 'claims_settlement';
  ELSIF _normalized LIKE '%claim%' THEN
    _code := 'claims_service';
  ELSIF _normalized LIKE '%lending%' OR _normalized LIKE '%mortgagee%'
        OR _normalized LIKE '%mortgage%' THEN
    _code := 'underwriting';
  ELSIF _normalized LIKE '%non%pay%' OR _normalized LIKE '%nonpay%'
        OR _normalized LIKE '%nsf%' OR _normalized LIKE '%premium not paid%'
        OR _normalized LIKE '%payment%' THEN
    _code := 'non_payment';
  ELSIF _normalized LIKE '%price%' OR _normalized LIKE '%rate%' OR _normalized LIKE '%cost%'
        OR _normalized LIKE '%too high%' OR _normalized LIKE '%too expensive%' THEN
    _code := 'price';
  ELSIF _normalized LIKE '%switched%' OR _normalized LIKE '%different company%'
        OR _normalized LIKE '%new carrier%' OR _normalized LIKE '%competitor%' THEN
    _code := 'switched';
  ELSIF _normalized LIKE '%dissatisf%' OR _normalized LIKE '%coverage%'
        OR _normalized LIKE '%service%' OR _normalized LIKE '%complaint%' THEN
    _code := 'service';
  ELSIF _normalized LIKE '%underwrit%' OR _normalized LIKE '%non%renew%'
        OR _normalized LIKE '%nonrenew%' OR _normalized LIKE '%mvr%'
        OR _normalized LIKE '%loss history%' OR _normalized LIKE '%risk%' THEN
    _code := 'underwriting';
  ELSIF _normalized LIKE '%marri%' OR _normalized LIKE '%divorce%'
        OR _normalized LIKE '%deceased%' OR _normalized LIKE '%death%'
        OR _normalized LIKE '%no longer%' THEN
    _code := 'life_event';
  ELSIF _normalized LIKE '%agency%request%' OR _normalized LIKE '%fraud%' THEN
    _code := 'agency_request';
  ELSIF _normalized LIKE '%insured%request%' OR _normalized LIKE '%insureds request%'
        OR _normalized LIKE '%all other%' THEN
    _code := 'insured_request_unspecified';     -- voluntary, no reason captured
  ELSE
    _code := 'other';
  END IF;

  SELECT id INTO _category_id FROM termination_reason_categories WHERE code = _code;
  RETURN _category_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) TO authenticated;

UPDATE public.lapse_events
SET termination_category_id = public.categorize_termination_reason(agency_id, termination_reason);
