// src/lib/reviews.js
// Google review asks. Staff send them from their own phones (sms: links), to
// every customer who bought, never only the happy ones, and nothing is offered
// in return (Google's review policy and the FTC's 2024 rule on fake/incentivized
// reviews). Partners who are customers can review their own experience; the
// text asks them to mention they're a referral partner, which the FTC expects.

import { copyValue } from './copyValues';
import { buildText } from './textTemplates';

// Your Google "write a review" link. Until it's set, the Google search for the
// agency (where "Write a review" is one tap away) stands in.
// Paste the real link in Rate Checks → Texts (copy key
// link.google_review); only an https link is used.
export const REVIEW_LINK_KEY = 'link.google_review';
export const REVIEW_LINK_FALLBACK = import.meta.env.VITE_GOOGLE_REVIEW_URL
  || 'https://www.google.com/search?q=Cam+Wiley+Allstate+Insurance+Conyers+GA';
export function reviewUrl() {
  const v = copyValue(REVIEW_LINK_KEY, '').trim();
  return /^https:\/\/\S+$/.test(v) ? v : REVIEW_LINK_FALLBACK;
}

// The texts themselves live with the others in lib/textTemplates (Rate Checks → Texts).
/** A customer who bought. */
export const customerReviewText = (name) => buildText('review', { name, reviewLink: reviewUrl() });

/** A referral partner who's also a customer. */
export const partnerReviewText = (name) => buildText('partnerReview', { name, reviewLink: reviewUrl() });

export const smsHref = (phone, body) => `sms:${phone ? `+1${String(phone).replace(/\D/g, '').slice(-10)}` : ''}?&body=${encodeURIComponent(body)}`;
