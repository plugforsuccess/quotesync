-- Add 'Not Connected' as a valid call_result value.
-- RingCentral exports use this for outbound calls that rang but were not answered,
-- distinct from 'Connected' (outbound answered) and 'VM/Missed' (inbound not answered).

ALTER TABLE rc_call_log
  DROP CONSTRAINT IF EXISTS rc_call_log_call_result_check;

ALTER TABLE rc_call_log
  ADD CONSTRAINT rc_call_log_call_result_check
  CHECK (call_result IN ('Connected', 'Not Connected', 'Answered', 'VM/Missed'));
