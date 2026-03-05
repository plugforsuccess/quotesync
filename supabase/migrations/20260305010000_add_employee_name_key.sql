-- Migration: Add employee_name_key to rc_call_log
-- Purpose: Store a normalized alias key alongside employee_name so that
-- backfill, unmatched aggregation, and alias lookups can match deterministically
-- across whitespace/punctuation/case variations of the same agent name.
--
-- The normalization logic (NFKC, lowercase, strip phone fragments, collapse whitespace)
-- lives in the JS application layer (normalizeAliasKey). This column is populated
-- at ingestion time and used for server-side matching.

-- ── Column ───────────────────────────────────────────────────────────────────────

ALTER TABLE rc_call_log
  ADD COLUMN IF NOT EXISTS employee_name_key text;

-- ── Backfill existing rows ───────────────────────────────────────────────────────
-- Apply a Postgres-side approximation of normalizeAliasKey:
-- lower + trim + collapse whitespace. This covers the vast majority of cases.
-- Exotic unicode / phone fragments in names are rare in practice; any mismatches
-- will self-heal when the admin creates an alias (alias_key is the JS-normalized value).

UPDATE rc_call_log
SET employee_name_key = lower(regexp_replace(trim(employee_name), '\s+', ' ', 'g'))
WHERE employee_name_key IS NULL;

-- Make non-nullable after backfill
ALTER TABLE rc_call_log
  ALTER COLUMN employee_name_key SET NOT NULL;

-- ── Index for unmatched aggregation + backfill lookups ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_rc_call_log_unmatched_key
  ON rc_call_log (org_id, employee_name_key)
  WHERE employee_user_id IS NULL;

-- ── Update the unmatched aggregation RPC to use the normalized key ────────────────
-- Must DROP first: changing RETURNS TABLE signature is not allowed with OR REPLACE
-- (Postgres error 42P13). Safe for SECURITY INVOKER functions with no dependent grants.

DROP FUNCTION IF EXISTS get_unmatched_agent_names(uuid);

CREATE FUNCTION get_unmatched_agent_names(p_org_id uuid)
RETURNS TABLE(name text, name_key text, call_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    -- Return both raw display name (for UI) and normalized key (for matching)
    min(employee_name)    AS name,       -- representative display name
    employee_name_key     AS name_key,
    count(*)              AS call_count
  FROM rc_call_log
  WHERE org_id = p_org_id
    AND employee_user_id IS NULL
    AND employee_name IS NOT NULL
    AND employee_name <> 'Unknown'
  GROUP BY employee_name_key
  ORDER BY call_count DESC
  LIMIT 200;
$$;
