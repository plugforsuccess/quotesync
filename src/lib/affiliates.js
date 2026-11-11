// src/lib/affiliates.js
// The affiliate program's public endpoint and a producer's recruit code (?by=CODE).
export const AFFILIATE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check-partner`
  : '/functions/v1/rate-check-partner';

/** The producer's recruit code from ?by=CODE, kept for the visit. */
export function recruitCode() {
  try {
    const by = new URLSearchParams(window.location.search).get('by');
    if (by && /^[A-Za-z0-9]{6,12}$/.test(by)) sessionStorage.setItem('partner_recruit_code', by.toUpperCase());
    return sessionStorage.getItem('partner_recruit_code');
  } catch { return null; }
}
