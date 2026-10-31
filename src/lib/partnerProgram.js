// src/lib/partnerProgram.js
// Rate Check partner program switches shared by the staff Partners tab and the portal.

// The partner agreement is off until the attorney / Allstate compliance review is done:
// partner links work and earn without a signature. When it's turned on (in step with
// AGREEMENT_REQUIRED in supabase/functions/rate-check-partner and
// PARTNER_AGREEMENT_REQUIRED in supabase/functions/rate-check), each partner is asked
// to sign the next time they open their portal, and their link pauses until they do.
export const PARTNER_AGREEMENT_REQUIRED = false;
