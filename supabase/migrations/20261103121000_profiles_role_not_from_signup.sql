-- Signups could set their own role (e.g. 'admin') through user metadata.
-- Only 'insured' may be requested at signup; everything else becomes 'editor'.
-- Admin is granted by an admin, never self-assigned.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    CASE WHEN NEW.raw_user_meta_data->>'role' = 'insured' THEN 'insured' ELSE 'editor' END
  );
  RETURN NEW;
END;
$$;
