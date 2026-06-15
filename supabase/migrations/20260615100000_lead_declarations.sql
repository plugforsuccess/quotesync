-- ============================================================================
-- Declarations-page intake — lead uploads their current policy "dec page" (PDF
-- preferred) and Claude extracts the relevant fields into the lead record.
-- ============================================================================
-- Storage:  private bucket `lead-declarations`, objects keyed by `{lead_id}/...`
--   * Anyone (anon funnel) may upload, but only under the folder of a lead that
--     actually exists — prevents arbitrary writes / orphaned files.
--   * Reads are restricted to authenticated agency members whose agency owns the
--     lead (matched on the first path segment = lead_id). The parse edge
--     function uses the service role, which bypasses these policies.
-- Data:  parsed fields land in leads.declaration_data (JSONB). Dec pages carry
--   repeating/nested structures (multiple vehicles/drivers/coverages) that map
--   poorly to flat columns, so we keep the extraction as a single document plus
--   a status/audit trail. The original PDF path + a parse status drive the UI.
-- ============================================================================

-- ── Lead columns ────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS declaration_data         jsonb,
  ADD COLUMN IF NOT EXISTS declaration_pdf_path     text,
  ADD COLUMN IF NOT EXISTS declaration_parse_status text,        -- pending | parsed | failed
  ADD COLUMN IF NOT EXISTS declaration_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS declaration_parsed_at    timestamptz;

COMMENT ON COLUMN public.leads.declaration_data IS
  'Structured fields extracted from the uploaded declarations page by the parse-declaration-pdf edge function. Nullable; agency may correct.';
COMMENT ON COLUMN public.leads.declaration_parse_status IS
  'pending = uploaded, awaiting parse; parsed = extraction succeeded; failed = extraction errored (PDF still on file).';

-- ── Private storage bucket ──────────────────────────────────────────────────
-- 15 MB cap; PDFs preferred, common phone-photo image types allowed as fallback.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-declarations',
  'lead-declarations',
  false,
  15728640,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = EXCLUDED.public;

-- ── Storage RLS ─────────────────────────────────────────────────────────────
-- Upload: the public funnel runs as `anon`; allow inserts only into the folder
-- of an existing lead (first path segment must be a real lead id).
DROP POLICY IF EXISTS "lead_decl_insert" ON storage.objects;
CREATE POLICY "lead_decl_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'lead-declarations'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ((storage.foldername(name))[1])::uuid
  )
);

-- Read: only authenticated agency members of the lead's owning agency. This is
-- what lets the agent generate a signed URL to view the original PDF.
DROP POLICY IF EXISTS "lead_decl_select" ON storage.objects;
CREATE POLICY "lead_decl_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lead-declarations'
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = ((storage.foldername(name))[1])::uuid
      AND l.agency_id IN (
        SELECT agency_id FROM public.agency_memberships
        WHERE user_id = auth.uid() AND status = 'active'
      )
  )
);
