-- A reached call doesn't always end in a save OR a loss — sometimes the rep just
-- spoke with the customer and nothing was resolved (still working it). Without a
-- neutral option, the required "what happened on this call?" prompt forced a
-- fake save tactic or a premature loss. Add a neutral choice that satisfies the
-- requirement honestly and is kept out of save-tactic and loss analytics.

ALTER TABLE public.intervention_types
  ADD COLUMN IF NOT EXISTS is_neutral BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.intervention_types
  (code, display_name, description, captures_premium, captures_competitor, sort_order, is_neutral)
VALUES
  ('spoke_no_decision', 'Spoke — no decision yet',
   'Reached them, but nothing was resolved this call — still working it.',
   false, false, 15, true)
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
