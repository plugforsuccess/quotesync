-- Migration: Sync legacy role column from platform_role
-- When platform_role is updated (e.g. via Supabase dashboard), automatically
-- keep the legacy `role` column in sync so ProtectedRoute's hasPermission()
-- check continues to work correctly.

-- Step 1: One-time sync of existing data
UPDATE profiles
SET role = CASE
    WHEN platform_role IN ('platform_admin', 'platform_master_admin') THEN 'admin'
    WHEN platform_role IN ('platform_editor', 'platform_support', 'platform_auditor') THEN 'editor'
    ELSE role
END
WHERE is_platform_user = true
  AND platform_role IS NOT NULL;

-- Ensure is_platform_user is true for anyone with a platform_role
UPDATE profiles
SET is_platform_user = true
WHERE platform_role IS NOT NULL
  AND is_platform_user = false;

-- Step 2: Create trigger to keep roles in sync going forward
CREATE OR REPLACE FUNCTION sync_legacy_role()
RETURNS TRIGGER AS $$
BEGIN
    -- When platform_role changes, sync the legacy role column
    IF NEW.platform_role IS DISTINCT FROM OLD.platform_role THEN
        NEW.role = CASE
            WHEN NEW.platform_role IN ('platform_admin', 'platform_master_admin') THEN 'admin'
            WHEN NEW.platform_role IN ('platform_editor', 'platform_support', 'platform_auditor') THEN 'editor'
            ELSE NEW.role
        END;
    END IF;

    -- When is_platform_user is set, ensure platform_role is reflected
    IF NEW.is_platform_user = true AND NEW.platform_role IS NOT NULL THEN
        NEW.role = CASE
            WHEN NEW.platform_role IN ('platform_admin', 'platform_master_admin') THEN 'admin'
            WHEN NEW.platform_role IN ('platform_editor', 'platform_support', 'platform_auditor') THEN 'editor'
            ELSE NEW.role
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_legacy_role_trigger ON profiles;
CREATE TRIGGER sync_legacy_role_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION sync_legacy_role();
