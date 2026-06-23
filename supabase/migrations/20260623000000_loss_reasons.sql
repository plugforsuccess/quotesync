-- Reached calls don't always end in a save. The required save-tactic prompt
-- assumed they did, which blocked recording a reached call that ended in a loss
-- (customer declined / leaving). Add a small set of "loss reasons" so a reached
-- loss can be logged in one tap — honest churn data, and it satisfies the
-- capture requirement without faking a save tactic.
--
-- is_loss_reason separates these from save tactics so they never count toward
-- per-tactic save rates or the learned save-lift.

ALTER TABLE public.intervention_types
  ADD COLUMN IF NOT EXISTS is_loss_reason BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.intervention_types
  (code, display_name, description, captures_premium, captures_competitor, sort_order, is_loss_reason)
VALUES
  ('loss_price',      'Declined — price too high', 'Reached them, but they left over price.',                 false, true,  20, true),
  ('loss_switched',   'Already switched carrier',  'Reached them, but they had already bound elsewhere.',     false, true,  21, true),
  ('loss_ineligible', 'No longer eligible',        'Lost for non-price reasons (no longer qualifies, moved).', false, false, 22, true),
  ('loss_other',      'Lost — other reason',       'Reached them, could not save — reason not listed above.',  false, false, 23, true)
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
