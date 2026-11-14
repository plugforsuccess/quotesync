// Producers recruit Rate Check partners (Schedule B floor: 2 activated a month).
//
// An affiliate is "activated" once they have BOTH signed up for real (their W-9 is on
// file, which is what unlocks their link; or the agreement, if that's turned back on)
// AND sent at least one qualified household (the same rule affiliate pay uses). It counts
// for the producer who recruited them (rate_check_promoters.recruited_by), in the month
// the later of the two happened. Signing up friends who never send anyone doesn't count.
import { households, monthKey } from './partnerPay.js';
import { PARTNER_AGREEMENT_REQUIRED } from '../../../lib/partnerProgram.js';

const later = (a, b) => (new Date(a) > new Date(b) ? a : b);
export const monthOf = (iso) => monthKey(iso); // 'YYYY-MM', agency time

/**
 * Every activated partner: { promoterId, name, recruitedBy, activatedAt, month }.
 * A household from the partner's own phone number never counts.
 */
export function activations(promoters, scans, now = Date.now(), rules, { agreementRequired = PARTNER_AGREEMENT_REQUIRED } = {}) {
  const all = households(scans, {}, now, rules).filter(h => !h.addOn); // a later add-on isn't a new household
  const out = [];
  for (const p of promoters || []) {
    const signedUp = agreementRequired ? p.agreement_signed_at : p.w9_received_at;
    if (!signedUp) continue;
    const own = (h) => !!p.phone && String(h.phone || '').replace(/\D/g, '').slice(-10) === String(p.phone).replace(/\D/g, '').slice(-10);
    const firsts = all.filter(h => h.promoterId === p.id && h.firstAt && !own(h)).map(h => h.firstAt).sort();
    if (!firsts.length) continue;
    const activatedAt = later(signedUp, firsts[0]);
    out.push({ promoterId: p.id, name: p.name, recruitedBy: p.recruited_by || null, activatedAt, month: monthOf(activatedAt) });
  }
  return out;
}

/** How many partners a producer activated in a month ('YYYY-MM'). */
export const activatedCount = (list, userId, month) =>
  (list || []).filter(a => a.recruitedBy === userId && a.month === month).length;

/** A producer's "Become a Partner" link. */
export const recruitUrl = (code, origin = typeof window !== 'undefined' ? window.location.origin : 'https://insuredbycam.com') =>
  `${origin}/affiliates?by=${encodeURIComponent(code)}`;
