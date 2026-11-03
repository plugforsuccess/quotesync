-- Defensive Driving refunds and disputes: an enrollment can be refunded or disputed
-- (access ends), its certificate is revoked, and enrollment records when the student
-- accepted the terms and refund policy.
ALTER TABLE public.dd_enrollments DROP CONSTRAINT IF EXISTS dd_enrollments_status_check;
ALTER TABLE public.dd_enrollments ADD CONSTRAINT dd_enrollments_status_check
  CHECK (status = ANY (ARRAY['pending_payment','active','completed','expired','refunded','disputed']));
ALTER TABLE public.dd_enrollments ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE public.dd_certificates ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE public.dd_certificates ADD COLUMN IF NOT EXISTS revoked_reason text;

NOTIFY pgrst, 'reload schema';
