-- ============================================================================
-- Termination taxonomy v2 — aligned to Allstate's real reason codes
-- ============================================================================
-- Adds six categories and rewrites categorize_termination_reason() to map
-- Allstate's actual reason strings to action-class categories automatically,
-- so principals never hand-map standard reasons (the aliases page becomes an
-- exception/override tool, not a chore). Existing lapse_events are
-- re-categorized so historical Terminations/Reasons analytics stay consistent.
--
-- Key calls:
--   * "Property Sold: New Property with Allstate" → Rewritten (a RETENTION
--     WIN, not a loss).
--   * Claims split into Service (preventable) vs Settlement (external).
--   * "Void" → First Payment Failure (preventable, new-business owned).
--   * "Duplicate Coverage" → its own category (preventable) — usually a
--     price/switch loss where the cancel request wasn't processed in time.
--   * Property/Vehicle sold → Asset Sold (partial — often re-writable).
-- ============================================================================

-- ─── 1. New categories ───────────────────────────────────────────────────────
INSERT INTO public.termination_reason_categories
  (code, display_name, description, action_class, color_token, sort_order)
VALUES
  ('first_payment_failure', 'First Payment Failure (Void)',
   'New policy voided — first payment failed and the policy never took effect. Preventable at bind (payment method / re-collection); a new-business onboarding issue, not retention.',
   'preventable', '#DC2626', 10),
  ('duplicate_coverage', 'Duplicate Coverage',
   'Back-dated cancellation coded as duplicate coverage — usually a price/switch loss where the cancellation request was not processed in time. Preventable through faster request handling and rate review.',
   'preventable', '#F97316', 11),
  ('claims_service', 'Claims – Service',
   'Dissatisfied with claim handling/service. Preventable through claims advocacy and proactive communication.',
   'preventable', '#EAB308', 12),
  ('claims_settlement', 'Claims – Settlement',
   'Dissatisfied with the claim settlement amount. Largely external — the carrier sets the payout (flip to partial if the agency actively does claims advocacy).',
   'external', '#8B5CF6', 13),
  ('asset_sold', 'Asset Sold',
   'Insured sold the insured asset (vehicle/property). Partial — often retainable via re-write or cross-sell when they replace the asset.',
   'partial', '#06B6D4', 14),
  ('total_loss', 'Total Loss',
   'Insured property was a total loss — no asset left to insure. External.',
   'external', '#6B7280', 15)
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Allstate-aware categorizer ───────────────────────────────────────────
-- Order matters: most-specific Allstate phrasing first, generic keywords last.
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

  -- Step 1: exact per-agency alias override (the aliases page)
  SELECT c.id INTO _category_id
  FROM termination_reason_aliases a
  JOIN termination_reason_categories c ON c.code = a.category_code
  WHERE a.agency_id = p_agency_id
    AND lower(a.raw_reason) = _normalized
  LIMIT 1;
  IF _category_id IS NOT NULL THEN
    RETURN _category_id;
  END IF;

  -- Step 2: built-in rules (handles standard Allstate codes hands-free)
  IF _normalized LIKE '%void%'
     OR _normalized LIKE '%first payment%' OR _normalized LIKE '%1st payment%'
     OR _normalized LIKE '%initial payment%' OR _normalized LIKE '%down payment%' THEN
    _code := 'first_payment_failure';
  ELSIF _normalized LIKE '%duplicate%' THEN
    _code := 'duplicate_coverage';
  ELSIF _normalized LIKE '%total loss%' THEN
    _code := 'total_loss';
  ELSIF _normalized LIKE '%property with allstate%' OR _normalized LIKE '%new property with allstate%' THEN
    _code := 'rewritten';                       -- rebought WITH Allstate = retained
  ELSIF _normalized LIKE '%another policy%' OR _normalized LIKE '%rewrit%'
        OR _normalized LIKE '%re-writ%' OR _normalized LIKE '%internal%' THEN
    _code := 'rewritten';
  ELSIF _normalized LIKE '%new owner%' THEN
    _code := 'asset_sold';                      -- same property, new owner
  ELSIF _normalized LIKE '%moved%' OR _normalized LIKE '%relocat%'
        OR _normalized LIKE '%out of state%' THEN
    _code := 'moved';
  ELSIF _normalized LIKE '%sold%' OR _normalized LIKE '%no longer own%'
        OR _normalized LIKE '%traded%' THEN
    _code := 'asset_sold';                      -- property/vehicle sold (other)
  ELSIF _normalized LIKE '%claim settlement%'
        OR (_normalized LIKE '%claim%' AND _normalized LIKE '%settle%') THEN
    _code := 'claims_settlement';
  ELSIF _normalized LIKE '%claim%' THEN
    _code := 'claims_service';                  -- dissatisfied with claim service
  ELSIF _normalized LIKE '%lending%' OR _normalized LIKE '%mortgagee%'
        OR _normalized LIKE '%mortgage%' THEN
    _code := 'underwriting';                    -- not accepted by lending institution
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
    _code := 'service';                         -- coverage / sales service dissatisfaction
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
  ELSE
    _code := 'other';                           -- includes "Insured's Request - All Other"
  END IF;

  SELECT id INTO _category_id FROM termination_reason_categories WHERE code = _code;
  RETURN _category_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) TO authenticated;

-- ─── 3. Re-categorize existing history ───────────────────────────────────────
-- Recompute every lapse row through the new rules. Per-agency alias overrides
-- still win (step 1), so any manual mappings are preserved.
UPDATE public.lapse_events
SET termination_category_id = public.categorize_termination_reason(agency_id, termination_reason);
