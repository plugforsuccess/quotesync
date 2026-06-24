-- "Happy with policy" — a reached renewal call where the customer is satisfied
-- and simply confirming they're staying. A positive outcome, but NOT a save:
-- there was nothing to save, so it must not be credited like a rep-driven save
-- (same principle as easy-pay auto-resolves: renewed, observed, not credited).
-- Flagged is_neutral so it's excluded from save-tactic and loss analytics; the
-- app resolves it as renewed-not-credited (auto_resolved) so it never lands in
-- the save tally. Renewal-only (a cancellation case is about payment, not
-- satisfaction).

INSERT INTO public.intervention_types
  (code, display_name, description, captures_premium, captures_competitor, sort_order, is_neutral, applies_to)
VALUES
  ('happy_with_policy', 'Happy with policy — confirmed staying',
   'Reached a satisfied customer simply confirming the renewal. Renewed, but not a save (nothing to save).',
   false, false, 16, true, 'renewal')
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
