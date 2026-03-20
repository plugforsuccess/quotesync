-- ============================================================================
-- Per-Agency Twilio Numbers
-- Adds twilio_from_number and agent_cell_number columns to agencies table
-- so each agency can have its own Twilio number and agent phone number.
-- Edge functions fall back to env vars when these are NULL (default agency).
-- ============================================================================

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS twilio_from_number TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS agent_cell_number TEXT;

COMMENT ON COLUMN agencies.twilio_from_number IS 'Per-agency Twilio number for outbound SMS/calls. Falls back to TWILIO_PHONE_NUMBER env var when NULL.';
COMMENT ON COLUMN agencies.agent_cell_number IS 'Per-agency agent cell number for call bridging and forwarded SMS. Falls back to AGENT_PHONE_NUMBER env var when NULL.';
