-- ============================================================================
-- Defensive Driving vertical — Phase 1 schema
-- ----------------------------------------------------------------------------
-- Self-contained module for the "Georgia 6-Hour Defensive Driving" course:
-- catalog, enrollments, gated progress, exams, certificates, and the
-- "Defensive Drivers Discount List" work queue.
--
-- All tables are namespaced `dd_`, use uuid PKs + timestamptz, and have RLS
-- enabled (default-deny). Completion/scoring/cert issuance are server-only
-- (service role / SECURITY DEFINER); the client never writes pass/complete
-- state and never reads question answer keys.
--
-- Role mapping (see dd_is_* helpers below) reuses the EXISTING two-plane RBAC:
--   admin     -> is_platform_admin()              (platform_admin / master)
--   principal -> agency_role 'principal'          (the agency principal; read-only)
--   staff     -> agency_role producer/manager/owner/employee, or platform_support+
--   insured   -> any authenticated user (ownership via user_id = auth.uid())
-- The mapping lives ONLY in the three helper functions so it can be retuned in
-- a single migration once Cam confirms the desired access model.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Role helper functions (single source of truth for dd_ access decisions)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dd_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT is_platform_admin();
$$;
COMMENT ON FUNCTION dd_is_admin() IS 'Defensive Driving: full access (platform admin/master).';

CREATE OR REPLACE FUNCTION dd_is_principal()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT dd_is_admin()
      OR EXISTS (
        SELECT 1 FROM agency_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.agency_role = 'principal'
      );
$$;
COMMENT ON FUNCTION dd_is_principal() IS 'Defensive Driving: agency principal (read-only queue overview).';

CREATE OR REPLACE FUNCTION dd_is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT dd_is_admin()
      OR is_platform_support()
      OR EXISTS (
        SELECT 1 FROM agency_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.agency_role IN ('producer', 'manager', 'owner', 'employee')
      );
$$;
COMMENT ON FUNCTION dd_is_staff() IS 'Defensive Driving: internal staff who work the discount queue.';

-- ---------------------------------------------------------------------------
-- 1. Courses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_courses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  version            TEXT NOT NULL DEFAULT '1.0',
  jurisdiction       TEXT NOT NULL DEFAULT 'GA',
  price_cents        INTEGER NOT NULL DEFAULT 2495 CHECK (price_cents >= 0),
  currency           TEXT NOT NULL DEFAULT 'usd',
  min_seat_seconds   INTEGER NOT NULL DEFAULT 21600,  -- 6h enforced minimum
  pass_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (pass_threshold_pct BETWEEN 1 AND 100),
  retake_limit       INTEGER NOT NULL DEFAULT 3 CHECK (retake_limit >= 0),
  retake_cooldown_seconds INTEGER NOT NULL DEFAULT 900,  -- 15-min cooldown
  exam_question_count INTEGER NOT NULL DEFAULT 25 CHECK (exam_question_count > 0),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  -- Compliance (see §3): never hardcode discount % or "DDS approved" in UI.
  is_dds_approved    BOOLEAN NOT NULL DEFAULT false,
  compliance_label   TEXT NOT NULL DEFAULT
    'Certificate of Completion — Defensive Driving. Insurance premium discounts are determined by your insurer; this course is not represented as DDS-certified.',
  dds_provider_no    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Modules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES dd_courses(id) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  min_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (min_seconds >= 0),  -- per-module floor
  content_ref TEXT NOT NULL,  -- slug/key into the app content adapter
  UNIQUE (course_id, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_dd_modules_course ON dd_modules(course_id);

-- ---------------------------------------------------------------------------
-- 3. Question bank (correct_key is NEVER sent to the client — see RLS below)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES dd_courses(id) ON DELETE CASCADE,
  module_id     UUID REFERENCES dd_modules(id) ON DELETE CASCADE,  -- NULL = final-exam pool
  qtype         TEXT NOT NULL CHECK (qtype IN ('mc', 'tf')),
  prompt        TEXT NOT NULL,
  choices       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,text}, ...]
  correct_key   TEXT NOT NULL,
  objective_tag TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_dd_questions_course ON dd_questions(course_id);
CREATE INDEX IF NOT EXISTS idx_dd_questions_module ON dd_questions(module_id);
CREATE INDEX IF NOT EXISTS idx_dd_questions_pool   ON dd_questions(course_id) WHERE module_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Enrollments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id             UUID NOT NULL REFERENCES dd_courses(id) ON DELETE RESTRICT,
  status                TEXT NOT NULL DEFAULT 'pending_payment'
                          CHECK (status IN ('pending_payment','active','completed','expired')),
  stripe_session_id     TEXT,
  purchased_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  -- Identity snapshot taken at enrollment so the certificate can't be altered
  -- by later profile edits (§8).
  student_name_snapshot TEXT,
  dln_snapshot          TEXT,
  dob_snapshot          DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dd_enrollments_user   ON dd_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_dd_enrollments_course ON dd_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_dd_enrollments_stripe ON dd_enrollments(stripe_session_id);
-- One non-expired enrollment per (user, course).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dd_enrollment_active
  ON dd_enrollments(user_id, course_id) WHERE status <> 'expired';

-- ---------------------------------------------------------------------------
-- 5. Per-module progress (seconds_spent accumulated server-side only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_module_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES dd_enrollments(id) ON DELETE CASCADE,
  module_id     UUID NOT NULL REFERENCES dd_modules(id) ON DELETE CASCADE,
  seconds_spent INTEGER NOT NULL DEFAULT 0 CHECK (seconds_spent >= 0),
  kc_passed     BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  UNIQUE (enrollment_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_dd_module_progress_enrollment ON dd_module_progress(enrollment_id);

-- ---------------------------------------------------------------------------
-- 6. Exam attempts (answers retained for audit)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_exam_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES dd_enrollments(id) ON DELETE CASCADE,
  attempt_no    INTEGER NOT NULL,
  score_pct     NUMERIC(5,2),
  passed        BOOLEAN NOT NULL DEFAULT false,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  answers       JSONB,  -- {question_id: selected_key, ...} retained for audit
  UNIQUE (enrollment_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS idx_dd_exam_attempts_enrollment ON dd_exam_attempts(enrollment_id);

-- ---------------------------------------------------------------------------
-- 7. Certificates (server-only insert; private storage)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_certificates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id         UUID NOT NULL UNIQUE REFERENCES dd_enrollments(id) ON DELETE CASCADE,
  certificate_uid       TEXT NOT NULL UNIQUE,  -- human-readable, e.g. GA-DD-2026-000123
  pdf_path              TEXT,                  -- storage key in dd-certificates bucket
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  score_pct             NUMERIC(5,2),
  student_name_snapshot TEXT,
  dln_snapshot          TEXT
);
CREATE INDEX IF NOT EXISTS idx_dd_certificates_enrollment ON dd_certificates(enrollment_id);

-- ---------------------------------------------------------------------------
-- 8. Discount queue — THE "Defensive Drivers Discount List"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dd_discount_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id  UUID NOT NULL UNIQUE REFERENCES dd_certificates(id) ON DELETE CASCADE,
  enrollment_id   UUID NOT NULL REFERENCES dd_enrollments(id) ON DELETE CASCADE,
  insured_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','in_review','applied','completed','archived')),
  assigned_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  policy_ref      TEXT,  -- staff record the policy the discount was applied to
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dd_queue_status      ON dd_discount_queue(status);
CREATE INDEX IF NOT EXISTS idx_dd_queue_assigned    ON dd_discount_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dd_queue_created     ON dd_discount_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_dd_queue_certificate ON dd_discount_queue(certificate_id);

-- ---------------------------------------------------------------------------
-- 9. Triggers
-- ---------------------------------------------------------------------------

-- Keep dd_discount_queue.updated_at fresh on any update.
CREATE OR REPLACE FUNCTION dd_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dd_queue_touch ON dd_discount_queue;
CREATE TRIGGER trg_dd_queue_touch
  BEFORE UPDATE ON dd_discount_queue
  FOR EACH ROW EXECUTE FUNCTION dd_touch_updated_at();

-- CORE REQUIREMENT (§4): every issued certificate is auto-pushed into the
-- discount queue exactly once. Idempotent via the unique certificate_id.
CREATE OR REPLACE FUNCTION dd_certificate_to_queue()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM dd_enrollments WHERE id = NEW.enrollment_id;

  INSERT INTO dd_discount_queue (certificate_id, enrollment_id, insured_user_id, status)
  VALUES (NEW.id, NEW.enrollment_id, v_user_id, 'new')
  ON CONFLICT (certificate_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dd_certificate_to_queue ON dd_certificates;
CREATE TRIGGER trg_dd_certificate_to_queue
  AFTER INSERT ON dd_certificates
  FOR EACH ROW EXECUTE FUNCTION dd_certificate_to_queue();

-- ---------------------------------------------------------------------------
-- 10. Enrollment-scoped read helper (for progress/exam/module RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dd_owns_enrollment(p_enrollment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dd_enrollments e
    WHERE e.id = p_enrollment_id AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION dd_has_active_enrollment(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dd_enrollments e
    WHERE e.course_id = p_course_id
      AND e.user_id = auth.uid()
      AND e.status IN ('active','completed')
  );
$$;

-- ===========================================================================
-- 11. Row Level Security (default-deny: enable RLS, grant only what's listed)
-- ===========================================================================

ALTER TABLE dd_courses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_enrollments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_module_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_exam_attempts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_certificates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dd_discount_queue   ENABLE ROW LEVEL SECURITY;

-- ---- dd_courses: catalog is publicly readable (active only); admin manages ---
DROP POLICY IF EXISTS dd_courses_select_public ON dd_courses;
CREATE POLICY dd_courses_select_public ON dd_courses
  FOR SELECT USING (is_active OR dd_is_staff());

DROP POLICY IF EXISTS dd_courses_admin_all ON dd_courses;
CREATE POLICY dd_courses_admin_all ON dd_courses
  FOR ALL TO authenticated USING (dd_is_admin()) WITH CHECK (dd_is_admin());

-- ---- dd_modules: enrolled students + staff may read; admin manages ----------
DROP POLICY IF EXISTS dd_modules_select ON dd_modules;
CREATE POLICY dd_modules_select ON dd_modules
  FOR SELECT TO authenticated
  USING (dd_has_active_enrollment(course_id) OR dd_is_staff());

DROP POLICY IF EXISTS dd_modules_admin_all ON dd_modules;
CREATE POLICY dd_modules_admin_all ON dd_modules
  FOR ALL TO authenticated USING (dd_is_admin()) WITH CHECK (dd_is_admin());

-- ---- dd_questions: NO direct client read (correct_key must never leak).
--      Served only via SECURITY DEFINER RPCs that strip correct_key.
--      Admin may manage the bank directly. -----------------------------------
DROP POLICY IF EXISTS dd_questions_admin_all ON dd_questions;
CREATE POLICY dd_questions_admin_all ON dd_questions
  FOR ALL TO authenticated USING (dd_is_admin()) WITH CHECK (dd_is_admin());

-- ---- dd_enrollments: insured own r/w-create; staff/admin read --------------
DROP POLICY IF EXISTS dd_enrollments_select_own ON dd_enrollments;
CREATE POLICY dd_enrollments_select_own ON dd_enrollments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR dd_is_staff() OR dd_is_principal());

DROP POLICY IF EXISTS dd_enrollments_insert_own ON dd_enrollments;
CREATE POLICY dd_enrollments_insert_own ON dd_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending_payment');

DROP POLICY IF EXISTS dd_enrollments_admin_all ON dd_enrollments;
CREATE POLICY dd_enrollments_admin_all ON dd_enrollments
  FOR ALL TO authenticated USING (dd_is_admin()) WITH CHECK (dd_is_admin());
-- NOTE: status transitions (active/completed) + identity snapshot updates are
-- performed server-side via the service role, which bypasses RLS.

-- ---- dd_module_progress: insured read own; staff/admin read ----------------
DROP POLICY IF EXISTS dd_module_progress_select ON dd_module_progress;
CREATE POLICY dd_module_progress_select ON dd_module_progress
  FOR SELECT TO authenticated
  USING (dd_owns_enrollment(enrollment_id) OR dd_is_staff());
-- Writes are server-only (heartbeat RPC / service role).

-- ---- dd_exam_attempts: insured read own; staff/admin read ------------------
DROP POLICY IF EXISTS dd_exam_attempts_select ON dd_exam_attempts;
CREATE POLICY dd_exam_attempts_select ON dd_exam_attempts
  FOR SELECT TO authenticated
  USING (dd_owns_enrollment(enrollment_id) OR dd_is_staff());
-- Scoring writes are server-only.

-- ---- dd_certificates: insured read own; staff/principal/admin read ---------
DROP POLICY IF EXISTS dd_certificates_select ON dd_certificates;
CREATE POLICY dd_certificates_select ON dd_certificates
  FOR SELECT TO authenticated
  USING (dd_owns_enrollment(enrollment_id) OR dd_is_staff() OR dd_is_principal());
-- Inserts are server-only (cert generation), which fires the queue trigger.

-- ---- dd_discount_queue: staff read+update; principal read-only; admin full -
DROP POLICY IF EXISTS dd_queue_select ON dd_discount_queue;
CREATE POLICY dd_queue_select ON dd_discount_queue
  FOR SELECT TO authenticated
  USING (dd_is_staff() OR dd_is_principal());

DROP POLICY IF EXISTS dd_queue_update_staff ON dd_discount_queue;
CREATE POLICY dd_queue_update_staff ON dd_discount_queue
  FOR UPDATE TO authenticated
  USING (dd_is_staff()) WITH CHECK (dd_is_staff());

DROP POLICY IF EXISTS dd_queue_admin_all ON dd_discount_queue;
CREATE POLICY dd_queue_admin_all ON dd_discount_queue
  FOR ALL TO authenticated USING (dd_is_admin()) WITH CHECK (dd_is_admin());
-- Inserts are server-only (the certificate trigger). Principal gets SELECT
-- only — no UPDATE/INSERT/DELETE policy applies to a principal-only user.

-- ===========================================================================
-- 12. Private certificate storage bucket + signed-URL-oriented policies
-- ===========================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('dd-certificates', 'dd-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: dd-certificates/{insured_user_id}/{certificate_uid}.pdf
-- Writes/signed-URL minting happen server-side (service role bypasses RLS).
-- These SELECT policies are defense-in-depth for any direct authenticated read.
DROP POLICY IF EXISTS dd_cert_obj_select_owner ON storage.objects;
CREATE POLICY dd_cert_obj_select_owner ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dd-certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS dd_cert_obj_select_staff ON storage.objects;
CREATE POLICY dd_cert_obj_select_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dd-certificates' AND (dd_is_staff() OR dd_is_principal()));

-- ===========================================================================
-- 13. Realtime — staff queue list updates live
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dd_discount_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE dd_discount_queue;
  END IF;
END $$;

-- ===========================================================================
-- 14. Table & function privileges (this project grants explicitly; RLS still
--     governs row visibility on top of these).
-- ===========================================================================

GRANT SELECT ON dd_courses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON dd_courses TO authenticated;            -- admin via RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON dd_modules TO authenticated;    -- admin via RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON dd_questions TO authenticated;  -- admin via RLS (no rows for non-admin)
GRANT SELECT, INSERT, UPDATE, DELETE ON dd_enrollments TO authenticated;
GRANT SELECT ON dd_module_progress TO authenticated;                    -- writes are server-only
GRANT SELECT ON dd_exam_attempts TO authenticated;                      -- writes are server-only
GRANT SELECT ON dd_certificates TO authenticated;                       -- inserts are server-only
GRANT SELECT, UPDATE ON dd_discount_queue TO authenticated;             -- inserts via trigger (server)

GRANT EXECUTE ON FUNCTION dd_is_admin()            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dd_is_staff()            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dd_is_principal()        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dd_owns_enrollment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION dd_has_active_enrollment(UUID) TO authenticated;
