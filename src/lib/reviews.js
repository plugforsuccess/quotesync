// src/lib/reviews.js
// Google review asks. Staff send them from their own phones (sms: links), to
// every customer who bought, never only the happy ones, and nothing is offered
// in return (Google's review policy and the FTC's 2024 rule on fake/incentivized
// reviews). Partners who are customers can review their own experience; the
// text asks them to mention they're a referral partner, which the FTC expects.

// Your Google "write a review" link. Until it's set, the Google search for the
// agency (where "Write a review" is one tap away) stands in.
export const GOOGLE_REVIEW_URL = import.meta.env.VITE_GOOGLE_REVIEW_URL
  || 'https://www.google.com/search?q=Cam+Wiley+Allstate+Insurance+Conyers+GA';

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** A customer who bought. */
export function customerReviewText(name) {
  return [
    `Hi ${first(name)}, it's Cam with Cam Wiley Agency. Thank you for trusting us with your insurance!`,
    '',
    `If you have a minute, an honest Google review helps other Georgia families find us: ${GOOGLE_REVIEW_URL}`,
    '',
    'Questions about your policy? Just reply here.',
  ].join('\n');
}

/** A referral partner who's also a customer. */
export function partnerReviewText(name) {
  return [
    `Hi ${first(name)}, it's Cam. Thank you for being a customer and a referral partner!`,
    '',
    `If you'd like to, an honest Google review about your experience as a customer would mean a lot: ${GOOGLE_REVIEW_URL}`,
    '',
    'Please mention that you\'re also one of our referral partners. Totally optional, and it has nothing to do with your referral fees.',
  ].join('\n');
}

export const smsHref = (phone, body) => `sms:${phone ? `+1${String(phone).replace(/\D/g, '').slice(-10)}` : ''}?&body=${encodeURIComponent(body)}`;
