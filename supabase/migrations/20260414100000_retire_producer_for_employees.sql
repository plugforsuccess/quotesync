-- Retire the legacy 'producer' agency_role for accounts that are linked to
-- an employee record. After this, employee membership rows uniformly use
-- agency_role = 'employee' and the specific function (sales / service_*)
-- is read from employees.roles.
--
-- Platform users who carry 'producer' temporarily during onboarding and
-- have no employee record are left untouched.

UPDATE agency_memberships am
SET agency_role = 'employee'
WHERE am.agency_role = 'producer'
  AND am.status = 'active'
  AND EXISTS (
    SELECT 1 FROM employees e
    WHERE e.auth_user_id = am.user_id
      AND e.org_id = am.agency_id
  );
