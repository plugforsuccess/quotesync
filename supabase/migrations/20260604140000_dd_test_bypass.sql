-- ============================================================================
-- Defensive Driving — per-course test bypass (skip Stripe during testing)
-- ----------------------------------------------------------------------------
-- When allow_test_bypass = true, dd-create-checkout activates the enrollment
-- immediately WITHOUT payment, so the course engine can be tested end-to-end
-- without a live Stripe configuration.
--
-- Default FALSE. This MUST be set back to false before the course goes live to
-- real customers — while true, any authenticated user can enroll for free.
-- ============================================================================

ALTER TABLE public.dd_courses
  ADD COLUMN IF NOT EXISTS allow_test_bypass BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dd_courses.allow_test_bypass IS
  'TEST ONLY: when true, enrollment is activated without Stripe payment. Must be false in production.';
