-- 035_parent_onboarding.sql
-- Parent onboarding system for overnight childcare platform.
-- Creates parents, children, child_medical_profiles, emergency_contacts,
-- and authorized_pickups tables with strict RLS policies.

-- =============================================================================
-- 1. PARENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  center_id uuid,
  onboarding_status text NOT NULL DEFAULT 'started'
    CHECK (onboarding_status IN (
      'started',
      'parent_profile_complete',
      'child_created',
      'medical_ack_complete',
      'emergency_contact_added',
      'complete'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_parents_user_id ON public.parents(user_id);
CREATE INDEX idx_parents_center_id ON public.parents(center_id) WHERE center_id IS NOT NULL;

-- =============================================================================
-- 2. CHILDREN TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  middle_name text,
  preferred_name text,
  dob date NOT NULL,
  gender text,
  photo_url text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  center_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_children_parent_id ON public.children(parent_id);
CREATE INDEX idx_children_center_id ON public.children(center_id) WHERE center_id IS NOT NULL;

-- =============================================================================
-- 3. CHILD MEDICAL PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.child_medical_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,

  has_allergies boolean NOT NULL DEFAULT false,
  has_medications boolean NOT NULL DEFAULT false,
  has_medical_conditions boolean NOT NULL DEFAULT false,

  allergies_summary text,
  medications_summary text,
  medical_conditions_summary text,

  physician_name text,
  physician_phone text,
  hospital_preference text,

  special_instructions text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id)
);

CREATE INDEX idx_child_medical_child_id ON public.child_medical_profiles(child_id);

-- =============================================================================
-- 4. EMERGENCY CONTACTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,

  first_name text NOT NULL,
  last_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  email text,

  is_primary boolean NOT NULL DEFAULT false,
  priority_order int NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_emergency_contacts_child_id ON public.emergency_contacts(child_id);

-- =============================================================================
-- 5. AUTHORIZED PICKUPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.authorized_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,

  first_name text NOT NULL,
  last_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,

  email text,
  dob date,

  verification_pin_hash text,
  photo_id_url text,

  is_emergency_contact boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_authorized_pickups_child_id ON public.authorized_pickups(child_id);

-- =============================================================================
-- 6. UPDATED_AT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_parents_updated_at
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_child_medical_profiles_updated_at
  BEFORE UPDATE ON public.child_medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_emergency_contacts_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_authorized_pickups_updated_at
  BEFORE UPDATE ON public.authorized_pickups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 7. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_pickups ENABLE ROW LEVEL SECURITY;

-- --- Parents RLS ---

CREATE POLICY parents_select_own ON public.parents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY parents_insert_own ON public.parents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY parents_update_own ON public.parents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- --- Children RLS (via parent ownership) ---

CREATE POLICY children_select_own ON public.children
  FOR SELECT TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

CREATE POLICY children_insert_own ON public.children
  FOR INSERT TO authenticated
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

CREATE POLICY children_update_own ON public.children
  FOR UPDATE TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()))
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

-- --- Child Medical Profiles RLS (via child → parent ownership) ---

CREATE POLICY medical_select_own ON public.child_medical_profiles
  FOR SELECT TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY medical_insert_own ON public.child_medical_profiles
  FOR INSERT TO authenticated
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY medical_update_own ON public.child_medical_profiles
  FOR UPDATE TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

-- --- Emergency Contacts RLS (via child → parent ownership) ---

CREATE POLICY ec_select_own ON public.emergency_contacts
  FOR SELECT TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ec_insert_own ON public.emergency_contacts
  FOR INSERT TO authenticated
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ec_update_own ON public.emergency_contacts
  FOR UPDATE TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ec_delete_own ON public.emergency_contacts
  FOR DELETE TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

-- --- Authorized Pickups RLS (via child → parent ownership) ---

CREATE POLICY ap_select_own ON public.authorized_pickups
  FOR SELECT TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ap_insert_own ON public.authorized_pickups
  FOR INSERT TO authenticated
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ap_update_own ON public.authorized_pickups
  FOR UPDATE TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ap_delete_own ON public.authorized_pickups
  FOR DELETE TO authenticated
  USING (child_id IN (
    SELECT c.id FROM public.children c
    JOIN public.parents p ON c.parent_id = p.id
    WHERE p.user_id = auth.uid()
  ));

-- =============================================================================
-- 8. COMMENTS
-- =============================================================================

COMMENT ON TABLE public.parents IS 'Parent accounts for overnight childcare platform';
COMMENT ON TABLE public.children IS 'Children enrolled in overnight childcare';
COMMENT ON TABLE public.child_medical_profiles IS 'Medical awareness profiles for children (allergies, medications, conditions)';
COMMENT ON TABLE public.emergency_contacts IS 'Emergency contacts for children';
COMMENT ON TABLE public.authorized_pickups IS 'Authorized pickup persons for children (PINs stored as hashes)';

COMMENT ON COLUMN public.parents.onboarding_status IS 'Tracks onboarding progress: started → parent_profile_complete → child_created → medical_ack_complete → emergency_contact_added → complete';
COMMENT ON COLUMN public.authorized_pickups.verification_pin_hash IS 'Hashed verification PIN — never store plaintext';
