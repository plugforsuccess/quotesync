-- ============================================================================
-- case_notes — append-only, typed/tagged, searchable note feed per case
-- ============================================================================
-- The standalone case.notes field was a single overwritable scratchpad (no
-- history, author, or timestamp). This replaces it with a proper audit-grade
-- log: one immutable row per note, server-stamped author + time, a note_type,
-- free tags, and full-text search across all cases. Built the same tamper-proof
-- way as the attempt log — body/author/time can't be edited, nothing deleted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.case_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  case_type     text NOT NULL CHECK (case_type IN ('renewal','cancel')),
  case_id       uuid NOT NULL,
  policy_no     text,
  customer_name text,
  note_type     text NOT NULL DEFAULT 'general'
                  CHECK (note_type IN ('general','call_summary','service','billing','escalation','internal','followup')),
  tags          text[] NOT NULL DEFAULT '{}',
  body          text NOT NULL CHECK (length(trim(body)) > 0),
  author_id     uuid,
  author_name   text,
  pinned        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  body_tsv      tsvector GENERATED ALWAYS AS (
                  to_tsvector('english',
                    coalesce(body,'') || ' ' || coalesce(policy_no,'') || ' ' || coalesce(customer_name,''))
                ) STORED
);

CREATE INDEX IF NOT EXISTS idx_case_notes_case    ON public.case_notes (agency_id, case_type, case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_notes_agency  ON public.case_notes (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_notes_tsv     ON public.case_notes USING GIN (body_tsv);
CREATE INDEX IF NOT EXISTS idx_case_notes_tags    ON public.case_notes USING GIN (tags);

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_notes_select ON public.case_notes FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
CREATE POLICY case_notes_insert ON public.case_notes FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
-- UPDATE allowed for agency members, but the trigger below restricts it to
-- metadata (pin/tags) — the note content is immutable.
CREATE POLICY case_notes_update ON public.case_notes FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status))
  WITH CHECK (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
-- No DELETE policy → append-only for authenticated; service_role retains admin.

GRANT SELECT, INSERT, UPDATE ON public.case_notes TO authenticated;

-- Server-authoritative author + timestamp on insert.
CREATE OR REPLACE FUNCTION public.stamp_case_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid; v_name text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_at := now();
    SELECT id, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
      INTO v_emp, v_name FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
    IF v_emp IS NOT NULL THEN
      NEW.author_id := v_emp;
      NEW.author_name := NULLIF(v_name, '');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_case_note ON public.case_notes;
CREATE TRIGGER trg_stamp_case_note BEFORE INSERT ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_case_note();

-- Immutable audit core — only pin + tags may change after creation.
CREATE OR REPLACE FUNCTION public.guard_case_note_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.case_type IS DISTINCT FROM OLD.case_type
     OR NEW.note_type IS DISTINCT FROM OLD.note_type THEN
    RAISE EXCEPTION 'Case notes are append-only — only pin and tags can change.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_case_note ON public.case_notes;
CREATE TRIGGER trg_guard_case_note BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_case_note_immutable();
