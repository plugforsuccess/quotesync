// src/lib/relationship.js
// How the person filling in a Rate Check relates to the policyholder, and to the partner
// who shared the link. "Other" is typed (40 characters) and tidied for the producer:
// "my COUSIN!!" → "Cousin", "his step-dad" → "Step-Dad".
export const POLICYHOLDER_RELATIONSHIPS = [
  ['spouse', 'Spouse / Partner'], ['parent', 'Parent'], ['child', 'Child'], ['household', 'Someone I Live With'], ['other', 'Other'],
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

/** Is the typed name the policyholder? Matches first + last, ignoring case, accents and punctuation. */
export function isPolicyholder(first, last, holder) {
  if (!holder?.first && !holder?.last) return true; // nothing to compare against
  const f = bare(first), l = bare(last);
  return !!f && !!l && f === bare(holder.first) && l === bare(holder.last);
}

/** What the producer reads: "Spouse of policyholder Dana Reyes", "Knows Javon: Coworker". */
export function relationshipLine(rel, other, holderName) {
  if (!rel || rel === 'self') return holderName ? `Policyholder: ${holderName}` : null;
  const label = rel === 'other' ? (other || 'Other') : (POLICYHOLDER_RELATIONSHIPS.find(([k]) => k === rel)?.[1] || rel);
  return `${label} of policyholder${holderName ? ` ${holderName}` : ''}`;
}
export function referrerLine(rel, other, partnerFirst) {
  if (!rel) return null;
  const label = rel === 'other' ? (other || 'Other') : (REFERRER_RELATIONSHIPS.find(([k]) => k === rel)?.[1] || rel);
  return `Knows ${partnerFirst || 'the partner'}: ${label}`;
}
