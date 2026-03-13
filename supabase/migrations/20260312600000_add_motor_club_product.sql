-- Add 'motor_club' to the revenue_entries product CHECK constraint
ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_product_check;

ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_product_check
    CHECK (product IN (
      'auto', 'ho', 'condo', 'renters', 'landlord',
      'specialty_auto', 'pup', 'manufactured',
      'boat', 'motor_club', 'other'
    ));

-- Add 'motor_club' to agency_products for Wiley-Wilson agency
INSERT INTO public.agency_products (
  agency_id, product_key, label, color,
  points_per_item, single_item, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'motor_club', 'Motor Club', '#F43F5E',
  0, true, 9
) ON CONFLICT (agency_id, product_key) DO NOTHING;
