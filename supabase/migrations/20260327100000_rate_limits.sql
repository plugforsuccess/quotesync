-- DB-backed rate limiting table (replaces in-memory map that resets on cold start)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TIMESTAMPTZ NOT NULL
);

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS rate_limits_reset_idx ON public.rate_limits (reset_at);
