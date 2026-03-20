-- Add is_vc_eligible flag to agency_products
-- Drives VC comp calculations in the comp model and revenue dashboard
-- true  = product counts toward VC payout (Allstate NB VC baseline rules)
-- false = non-VC product (bonus tracked separately if applicable)

ALTER TABLE public.agency_products
  ADD COLUMN IF NOT EXISTS is_vc_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agency_products.is_vc_eligible IS
  'True if this product is eligible for Allstate NB variable compensation payout per current VC rules. Drives comp model actuals and dashboard VC/non-VC split.';

-- Update Wiley-Wilson agency products with correct VC eligibility
UPDATE public.agency_products SET is_vc_eligible = CASE product_key
  WHEN 'auto'           THEN true
  WHEN 'specialty_auto' THEN true
  WHEN 'ho'             THEN true
  WHEN 'condo'          THEN true
  WHEN 'renters'        THEN true
  WHEN 'landlord'       THEN true
  WHEN 'pup'            THEN true
  WHEN 'boat'           THEN true
  WHEN 'manufactured'   THEN true
  ELSE false  -- motor_club, other
END
WHERE agency_id = '00000000-0000-0000-0000-000000000001';
