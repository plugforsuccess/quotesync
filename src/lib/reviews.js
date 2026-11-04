// src/lib/reviews.js
// Google review asks. Staff send them from their own phones (sms: links), to
// every customer who bought, never only the happy ones, and nothing is offered
// in return (Google's review policy and the FTC's 2024 rule on fake/incentivized
// reviews). Partners who are customers can review their own experience; the
// text asks them to mention they're a referral partner, which the FTC expects.

import { copyValue } from './copyValues';

// Your Google "write a review" link. Until it's set, the Google search for the
// agency (where "Write a review" is one tap away) stands in.
// Paste the real link in Rate Checks → Scripts → Google reviews (copy key
// link.google_review); only an https link is used.
export const REVIEW_LINK_KEY = 'link.google_review';
export const REVIEW_LINK_FALLBACK = import.meta.env.VITE_GOOGLE_REVIEW_URL
  || 'https://www.google.com/search?q=Cam+Wiley+Allstate+Insurance+Conyers+GA';
export function reviewUrl() {
  const v = copyValue(REVIEW_LINK_KEY, '').trim();
  return /^https:\/\/\S+$/.test(v) ? v : REVIEW_LINK_FALLBACK;
}

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

// The two texts, editable paragraph by paragraph in Rate Checks → Scripts →
// Google reviews (keys sms.review.customer.1-3, sms.review.partner.1-3). [first name]
// and [review link] are filled in when a text is sent. The automatic thank-you sent
// on "Mark bound" (rate-check-outcome) builds the customer text from the same keys.
export const REVIEW_TEXTS = {
  customer: {
    key: 'sms.review.customer',
    paragraphs: [
      "Hi [first name], it's Cam with Cam Wiley Agency. Thank you for trusting us with your insurance!",
      'If you have a minute, an honest Google review helps other Georgia families find us: [review link]',
      'Questions about your policy? Just reply here.',
    ],
  },
  partner: {
    key: 'sms.review.partner',
    paragraphs: [
      "Hi [first name], it's Cam. Thank you for being a customer and a referral partner!",
      "If you'd like to, an honest Google review about your experience as a customer would mean a lot: [review link]",
      "Please mention that you're also one of our referral partners. Totally optional, and it has nothing to do with your referral fees.",
    ],
  },
};

export function fillReviewText(template, name) {
  return String(template)
    .replace(/\[first name\]/gi, first(name))
    .replace(/\[review link\]/gi, reviewUrl());
}

const build = ({ key, paragraphs }, name) => fillReviewText(
  paragraphs.map((p, i) => copyValue(`${key}.${i + 1}`, p)).filter(t => t.trim()).join('\n\n'), name);

/** A customer who bought. */
export const customerReviewText = (name) => build(REVIEW_TEXTS.customer, name);

/** A referral partner who's also a customer. */
export const partnerReviewText = (name) => build(REVIEW_TEXTS.partner, name);

export const smsHref = (phone, body) => `sms:${phone ? `+1${String(phone).replace(/\D/g, '').slice(-10)}` : ''}?&body=${encodeURIComponent(body)}`;
