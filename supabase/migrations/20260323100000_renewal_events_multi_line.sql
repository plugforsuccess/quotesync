-- Add multi_line column to renewal_events.
-- Yes = bundled customer (auto + property), No = monoline auto, NULL = property lines (not reported).

ALTER TABLE public.renewal_events
  ADD COLUMN IF NOT EXISTS multi_line TEXT
    CHECK (multi_line IN ('Yes', 'No'));
-- NULL is valid (property lines) — no NOT NULL constraint
