// src/lib/affiliates.js
// The affiliate program's public endpoint, a producer's recruit code (?by=CODE), the
// program rules shown on /affiliates and /affiliates/terms, and what affiliates agree to.
import { useEffect, useState } from 'react';
export const AFFILIATE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check-partner`
  : '/functions/v1/rate-check-partner';

/** The affiliate who invited them, from ?aff=CODE (credit only), kept for the visit. */
export function affiliateRef() {
  try {
    const aff = new URLSearchParams(window.location.search).get('aff');
    if (aff && /^[A-Za-z0-9]{6,12}$/.test(aff)) sessionStorage.setItem('affiliate_invite_code', aff.toUpperCase());
    return sessionStorage.getItem('affiliate_invite_code');
  } catch { return null; }
}

/** The producer's recruit code from ?by=CODE, kept for the visit. */
export function recruitCode() {
  try {
    const by = new URLSearchParams(window.location.search).get('by');
    if (by && /^[A-Za-z0-9]{6,12}$/.test(by)) sessionStorage.setItem('partner_recruit_code', by.toUpperCase());
    return sessionStorage.getItem('partner_recruit_code');
  } catch { return null; }
}

// What an affiliate agrees to: the box on the application and on portal step 1. Same
// version and words as TERMS_VERSION / TERMS_TEXT in supabase/functions/rate-check-partner
// (the function stores its own copy with each agreement; a unit test keeps them equal).
export const AFFILIATE_TERMS_VERSION = 'aff-terms-v1';
export const AFFILIATE_TERMS_TEXT = 'I agree to the Affiliate Program Terms and to get texts from Cam Wiley Agency, Inc. about my application and the program. Msg & data rates may apply. Reply STOP to opt out.';
export const AFFILIATE_TERMS_PATH = '/affiliates/terms';

// The rules, said plainly (on /affiliates and in the terms).
export const AFFILIATE_DO = [
  'Share your personal link with people you know, or with your own followers.',
  'Say you’re paid for referrals when you share it (“I get a referral fee”).',
  'Send any insurance questions to Cam’s licensed team.',
];
export const AFFILIATE_DONT = [
  'Talk about coverage or prices, compare quotes, or promise anyone savings.',
  'Give any part of your fee, or anything else, to the people you refer.',
  'Act as an agent of Cam Wiley Agency or Allstate.',
];

export const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const ordinal = (n) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
};

/** What affiliates are paid, from the agency's payout rules. null while loading; false if it couldn't load. */
export function useAffiliateProgram() {
  const [p, setP] = useState(null);
  useEffect(() => {
    let gone = false;
    fetch(AFFILIATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
      body: JSON.stringify({ mode: 'program' }),
    }).then(r => (r.ok ? r.json() : Promise.reject())).then(d => { if (!gone) setP(d?.tiers?.length ? d : false); })
      .catch(() => { if (!gone) setP(false); });
    return () => { gone = true; };
  }, []);
  return p;
}
