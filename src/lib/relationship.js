// src/lib/relationship.js
// How the person filling in a Rate Check relates to the policyholder, and to the partner
// who shared the link. "Other" is typed (40 characters) and tidied for the producer:
// "my COUSIN!!" → "Cousin", "his step-dad" → "Step-Dad".
export const POLICYHOLDER_RELATIONSHIPS = [
  ['spouse', 'Spouse'], ['domestic_partner', 'Partner'], ['parent', 'Parent'], ['child', 'Child'], ['household', 'Someone I Live With'], ['other', 'Other'],
];
export const REFERRER_RELATIONSHIPS = [
  ['friend', 'Friend'], ['family', 'Family'], ['coworker', 'Coworker'], ['client', 'Client of Theirs'], ['other', 'Other'],
];
export const OTHER_MAX = 40;

export function normalizeOther(text) {
  const words = String(text || '')
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^(my|his|her|their|our|the|a|an)\s+/, '')
    .slice(0, OTHER_MAX)
    .trim();
  return words.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

const bare = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

/** Is the typed name a policyholder? The first named insured, or any other named insured
 * (husband and wife both on the policy). Ignores case, accents, punctuation and middle names. */
export function isPolicyholder(first, last, holder) {
  if (!holder?.first && !holder?.last) return true; // nothing to compare against
  const f = bare(first), l = bare(last);
  if (!f || !l) return false;
  if (f === bare(holder.first) && l === bare(holder.last)) return true;
  return (holder.co || []).some(full => {
    const w = String(full).trim().split(/\s+/);
    if (w.length < 2 || bare(w[w.length - 1]) !== l) return false;
    return bare(w[0]) === f || bare(w.slice(0, -1).join(' ')) === f; // "Lee" or "Lee Ann"
  });
}

/** What the producer reads: "Spouse of policyholder Dana Reyes", "Knows Javon: Coworker". */
export function relationshipLine(rel, other, holderName) {
  if (!rel || rel === 'self') return holderName ? `Policyholder: ${holderName}` : null;
  const label = rel === 'other' ? (other || 'Other') : (POLICYHOLDER_RELATIONSHIPS.find(([k]) => k === rel)?.[1] || rel);
  return `${label} of policyholder${holderName ? ` ${holderName}` : ''}`;
}
/** How they know the affiliate, on its own: "Friend", "Coworker". */
export function referrerLabel(rel, other) {
  if (!rel) return null;
  return rel === 'other' ? (other || 'Other') : (REFERRER_RELATIONSHIPS.find(([k]) => k === rel)?.[1] || rel);
}
export function referrerLine(rel, other, partnerFirst) {
  const label = referrerLabel(rel, other);
  return label ? `Knows ${partnerFirst || 'the partner'}: ${label}` : null;
}
