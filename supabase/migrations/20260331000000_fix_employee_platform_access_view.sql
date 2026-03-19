-- Fix employee_platform_access view: role_type was dropped in favor of roles TEXT[].
-- Also add preferred_name, roles, hire_date, allstate_id to support the team page.

DROP VIEW IF EXISTS employee_platform_access;

CREATE VIEW employee_platform_access AS
SELECT
  e.id              AS employee_id,
  e.org_id          AS agency_id,
  e.first_name,
  e.last_name,
  e.preferred_name,
  e.roles,
  e.hire_date,
  e.allstate_id,
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
