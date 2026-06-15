-- ============================================================================
-- Pre-launch lockdown: SECURITY DEFINER functions over-granted to anon/auth
-- ============================================================================
-- These run with elevated (owner) privileges. They were EXECUTE-granted to
-- `anon` (unauthenticated) and `authenticated` (any logged-in user). Several
-- mutate across tenants or touch money. Tighten to least privilege:
--
--   * run_monthly_bonus_close — FINANCIAL. Finalizes the retention-bonus
--     ledger for all agencies. No client calls it (cron job only). A rep must
--     never trigger it. Restrict to cron/service_role + platform owner.
--   * auto_resolve_stale_renewals / flag_unreached_pre_bill_renewals — global
--     mutations; legitimately invoked by authenticated users on upload, so keep
--     `authenticated` but drop `anon`.
--   * reconcile_renewal_outcomes / start_impersonation — already guard
--     internally (membership / is_platform_admin); drop the pointless `anon`
--     grant as hygiene.
-- ============================================================================

-- Financial: cron + service_role + postgres only (no interactive callers exist).
REVOKE EXECUTE ON FUNCTION public.run_monthly_bonus_close(date) FROM anon, authenticated;

-- Global mutators: drop unauthenticated execution.
REVOKE EXECUTE ON FUNCTION public.auto_resolve_stale_renewals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_unreached_pre_bill_renewals() FROM anon;

-- Internally-guarded but over-granted: hygiene.
REVOKE EXECUTE ON FUNCTION public.reconcile_renewal_outcomes(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_impersonation(uuid, text, boolean) FROM anon;
