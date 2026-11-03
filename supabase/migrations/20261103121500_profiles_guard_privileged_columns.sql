-- Users can update their own profile row (theme, name), but that policy also let them
-- change role / platform_role / is_platform_user and make themselves admin.
-- Only an existing admin (or the service role / SQL editor, where auth.uid() is null)
-- may change those columns. Named so it fires before sync_legacy_role_trigger.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.platform_role IS DISTINCT FROM OLD.platform_role
      OR NEW.is_platform_user IS DISTINCT FROM OLD.is_platform_user)
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND (p.role = 'admin' OR p.platform_role IN ('platform_admin', 'platform_master_admin'))
     )
  THEN
    RAISE EXCEPTION 'Only an admin can change roles' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_privileged_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();
