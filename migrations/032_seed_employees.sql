-- 032_seed_employees.sql
-- Seed existing employees: Tracy Peacock (CS Rep) and Cameron Wiley (Admin).
-- Replace '[YOUR_ORG_ID]' with the actual agency UUID before running.
-- IMPORTANT: SSN is intentionally NOT stored.

-- Tracy Peacock (CS Rep)
INSERT INTO public.employees (
  org_id, first_name, last_name, role_type, employment_status,
  allstate_id, rc_display_name, personal_email, cell_phone, home_phone,
  address_line1, city, state, zip_code,
  is_licensed, license_verified_date, hire_date,
  years_insurance_experience, years_commercial_experience,
  highest_education, last_verified_at
) VALUES (
  '[YOUR_ORG_ID]',
  'Tracy', 'Peacock', 'service', 'active',
  'sga93b0k', 'Tracy Peacock', 'tpeacock1936@gmail.com', '678-371-1936', '706-468-1243',
  '80 Chimney Ct', 'Covington', 'GA', '30014-5708',
  true, '2026-02-10', '2026-02-10',
  5, 5,
  'Some College', now()
) ON CONFLICT DO NOTHING;

-- Cameron Wiley (Admin/Agent)
INSERT INTO public.employees (
  org_id, first_name, last_name, role_type, employment_status,
  rc_display_name, allstate_id, last_verified_at,
  auth_user_id
) VALUES (
  '[YOUR_ORG_ID]',
  'Cam', 'Wiley', 'admin', 'active',
  'Cam Wiley', NULL, now(),
  'e9d8df65-7cd4-419b-b53c-6a8e734dc1c1'
) ON CONFLICT DO NOTHING;
