-- Add item_count from both pending_cancel_events and renewal_events
-- to the policy_retention_status view.
-- pending_cancel_events does not have item_count — default to 1.
-- renewal_events has item_count (auto = actual vehicles, property = 1).

CREATE OR REPLACE VIEW public.policy_retention_status AS
SELECT
  COALESCE(pc.policy_no, re.policy_no)              AS policy_no,
  COALESCE(pc.customer_name, re.customer_name)      AS customer_name,
  COALESCE(pc.product, re.product)                  AS product,
  COALESCE(pc.agency_id, re.agency_id)              AS agency_id,

  -- Pending cancel fields
  pc.id                                              AS cancel_event_id,
  pc.status                                          AS cancel_status,
  pc.cancel_effective_date,
  pc.premium_at_risk,
  pc.assigned_to_id                                  AS cancel_assigned_to_id,
  pc.attempt_count                                   AS cancel_attempts,
  pc.cycle,
  pc.promise_date,
  pc.notes                                           AS cancel_notes,
  1                                                  AS cancel_item_count,

  -- Renewal fields
  re.id                                              AS renewal_event_id,
  re.status                                          AS renewal_status,
  re.renewal_date,
  re.premium                                         AS renewal_premium,
  re.premium_change,
  re.premium_change_pct,
  re.original_year,
  re.assigned_to_id                                  AS renewal_assigned_to_id,
  re.attempt_count                                   AS renewal_attempts,
  re.phone,
  re.email,
  re.easy_pay,
  re.notes                                           AS renewal_notes,
  COALESCE(re.item_count, 1)                         AS renewal_item_count,

  -- Risk classification
  CASE
    WHEN pc.id IS NOT NULL AND re.id IS NOT NULL THEN 'dual_risk'
    WHEN pc.id IS NOT NULL                       THEN 'pending_cancel'
    ELSE                                              'renewal'
  END AS risk_type

FROM pending_cancel_events pc
FULL OUTER JOIN renewal_events re
  ON  re.policy_no  = pc.policy_no
  AND re.agency_id  = pc.agency_id
  AND re.status NOT IN ('confirmed', 'lost', 'auto_resolved')
WHERE
  (pc.id IS NOT NULL AND pc.status NOT IN ('saved','lost','auto_resolved','requested_cancellation'))
  OR
  (re.id IS NOT NULL AND re.status NOT IN ('confirmed','lost','auto_resolved'));

GRANT SELECT ON public.policy_retention_status TO authenticated;
