CREATE TABLE IF NOT EXISTS revenue_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  product        TEXT NOT NULL CHECK (product IN ('auto', 'ho', 'renters', 'other')),
  premium        NUMERIC(10, 2) NOT NULL CHECK (premium > 0),
  policy_count   INTEGER NOT NULL DEFAULT 1,
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'upload')),
  note           TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for date-range queries (the primary access pattern)
CREATE INDEX IF NOT EXISTS revenue_entries_agency_date_idx
  ON revenue_entries (agency_id, date DESC);

-- RLS
ALTER TABLE revenue_entries ENABLE ROW LEVEL SECURITY;

-- platform_admin and platform_master_admin can read all entries for their agency
CREATE POLICY "revenue_entries_select" ON revenue_entries
  FOR SELECT USING (
    agency_id = (
      SELECT agency_id FROM profiles
      WHERE id = auth.uid()
    )
  );

-- platform_admin and platform_master_admin can insert
CREATE POLICY "revenue_entries_insert" ON revenue_entries
  FOR INSERT WITH CHECK (
    agency_id = (
      SELECT agency_id FROM profiles
      WHERE id = auth.uid()
    )
  );

-- Only the creator or a platform_master_admin can delete
CREATE POLICY "revenue_entries_delete" ON revenue_entries
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND platform_role = 'platform_master_admin'
    )
  );
