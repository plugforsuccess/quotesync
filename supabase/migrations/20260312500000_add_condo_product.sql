-- Split 'condo' out from 'ho' as a distinct product key
-- Condo (HO6) has a different CAT reinsurance factor (0.959) than HO3 (0.935)

ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_product_check;

ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_product_check
    CHECK (product IN (
      'auto', 'ho', 'condo', 'renters', 'landlord',
      'specialty_auto', 'pup', 'manufactured',
      'boat', 'motor_club', 'other'
    ));

-- Add 'condo' to agency_products for Wiley-Wilson agency
INSERT INTO public.agency_products (
  agency_id, product_key, label, color,
  points_per_item, single_item, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'condo', 'Condo', '#34D399',
  20, true, 3
) ON CONFLICT (agency_id, product_key) DO NOTHING;
