-- Add 'boat' to the allowed product types in revenue_entries
ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_product_check;

ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_product_check
    CHECK (product IN (
      'auto', 'ho', 'renters', 'landlord',
      'specialty_auto', 'pup', 'manufactured',
      'boat', 'other'
    ));
