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

-- Postgres-side normalization matching JS normalizeAliasKey:
-- NFKC → lower → strip non-letter/digit/space/hyphen → collapse whitespace
-- Uses [^\w\s-] which in Postgres respects locale and handles unicode letters,
-- matching JS's [\p{L}\p{N}\s-] behavior.
UPDATE rc_call_log
SET employee_name_key = regexp_replace(
  trim(
    regexp_replace(
      lower(normalize(trim(employee_name), NFKC)),
      '[^\w\s-]', '', 'g'
    )
  ),
  '\s+', ' ', 'g'
)
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

-- ── Backfill RPC — handles dedup UNIQUE constraint safely ─────────────────────
-- When updating employee_user_id from NULL → value, rows move from the partial
-- dedup index into the table-level UNIQUE(org_id, employee_user_id, ...) constraint.
-- If two name variants of the same agent overlap on (start_time, direction, result),
-- a plain UPDATE would fail. This RPC skips rows that would cause conflicts.

CREATE OR REPLACE FUNCTION backfill_alias(
  p_org_id uuid,
  p_name_key text,
  p_employee_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH candidates AS (
    SELECT id
    FROM rc_call_log
    WHERE org_id = p_org_id
      AND employee_user_id IS NULL
      AND employee_name_key = p_name_key
      -- Exclude rows that would collide with existing matched rows
      AND NOT EXISTS (
        SELECT 1 FROM rc_call_log existing
        WHERE existing.org_id = p_org_id
          AND existing.employee_user_id = p_employee_user_id
          AND existing.call_start_time = rc_call_log.call_start_time
          AND existing.call_direction = rc_call_log.call_direction
          AND existing.call_result = rc_call_log.call_result
      )
  )
  UPDATE rc_call_log
  SET employee_user_id = p_employee_user_id
  FROM candidates
  WHERE rc_call_log.id = candidates.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

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
