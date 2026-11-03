-- Defensive Driving: turn off the test bypass (free enrollment without payment).
-- It was left on after testing; enrollments must now go through Stripe Checkout.
UPDATE public.dd_courses SET allow_test_bypass = false WHERE allow_test_bypass;
