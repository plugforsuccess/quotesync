-- ============================================================================
-- Defensive Driving — allow the 'insured' profile role for course customers
-- ----------------------------------------------------------------------------
-- Insured customers self-register through the Defensive Driving enrollment
-- flow, which passes role:'insured' in the signup metadata. handle_new_user()
-- already honors raw_user_meta_data->>'role', but the profiles.role CHECK only
-- permitted 'editor'/'admin', which would reject 'insured'. Extend it.
--
-- 'insured' is intentionally NOT in the legacy role hierarchy (viewer<editor<
-- admin), so hasPermission('insured', 'editor') is false — an insured customer
-- cannot satisfy any requiredRole-gated route. This change is purely additive
-- and does NOT alter the global default role for other signup flows.
-- ============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['editor'::text, 'admin'::text, 'insured'::text]));
