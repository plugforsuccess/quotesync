-- Link employees to agency_memberships via employee_platform_access view.
-- employees.auth_user_id is the bridge — populated when an employee gets a QuoteSync login.
-- No schema change needed to employees — auth_user_id already exists.

CREATE OR REPLACE VIEW employee_platform_access AS
SELECT
  e.id              AS employee_id,
  e.org_id          AS agency_id,
  e.first_name,
  e.last_name,
  e.role_type,
  e.employment_status,
  e.auth_user_id,
  am.id             AS membership_id,
  am.agency_role,
  am.status         AS membership_status,
  p.email,
  p.full_name
FROM employees e
LEFT JOIN agency_memberships am
  ON am.user_id = e.auth_user_id
  AND am.agency_id = e.org_id
LEFT JOIN profiles p
  ON p.id = e.auth_user_id
WHERE e.employment_status = 'active';

GRANT SELECT ON employee_platform_access TO authenticated;
