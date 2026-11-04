// src/lib/textTemplates.js
// Every text customers and partners receive, in one list. The owner edits them in
// Rate Checks → Texts (copy editor pencil; principals only), paragraph by paragraph
// (keys `${key}.1`, `${key}.2`, …). Blanks like [first name] fill in when a text is
// sent. Automatic texts always end with "Reply STOP to opt out." — that line is added
// when it's sent and can't be edited away.
//
// The automatic ones are sent by supabase/functions/rate-check-outcome, which keeps a
// copy of these defaults; change a default here, change it there too.
import { copyValue } from './copyValues';

export const STOP_LINE = 'Reply STOP to opt out.';

export const TEXT_GROUPS = ['After a quote', 'After they buy', 'Partners'];

export const TEXT_TEMPLATES = [
  {
    id: 'hold', group: 'After a quote', key: 'sms.quote.hold', auto: false,
    name: 'Working on it',
    when: 'When you tap “Text now” on an inbox card.',
    blanks: ['[first name]'],
    paragraphs: ["Hi [first name], it's Cam with Allstate. I'm working on your quote now and I'll have it to you shortly."],
  },
  {
    id: 'ready', group: 'After a quote', key: 'sms.quote.ready', auto: true,
    name: 'Your quote is ready',
    when: 'Sent automatically when your quote beats their price. Keep “Reply Y”: their Y is what tells you to call.',
    blanks: ['[first name]'],
    paragraphs: [
      "Hi [first name], it's Cam Wiley's office. Your Allstate quote is ready and it looks like we can save you money.",
      "Reply Y and we'll call you to go over it.",
    ],
  },
  {
    id: 'lost', group: 'After a quote', key: 'sms.quote.lost', auto: true,
    name: 'We couldn’t beat it',
    when: 'Sent automatically when your quote comes in higher than what they pay.',
    blanks: ['[first name]', '[carrier]'],
    paragraphs: [
      "Hi [first name], this is Cam Wiley's office. We checked your [carrier] policy and you're in good shape: we couldn't beat it today.",
      "We'll reach out if that changes.",
    ],
  },
  {
    id: 'review', group: 'After they buy', key: 'sms.review.customer', auto: true,
    name: 'Thank you + Google review',
    when: 'Sent automatically when you mark a rate check bound. Or tap to text it yourself.',
    blanks: ['[first name]', '[review link]'],
    paragraphs: [
      "Hi [first name], it's Cam with Cam Wiley Agency. Thank you for trusting us with your insurance!",
      'If you have a minute, an honest Google review helps other Georgia families find us: [review link]',
      'Questions about your policy? Just reply here.',
    ],
  },
  {
    id: 'partnerWelcome', group: 'Partners', key: 'sms.partner.welcome', auto: false,
    name: 'Welcome a new partner',
    when: 'When you tap “Text” next to a new partner’s portal link.',
    blanks: ['[first name]', '[portal link]'],
    paragraphs: [
      "Hi [first name], it's Cam with Cam Wiley Agency. Welcome aboard as a referral partner!",
      'Your private partner page: [portal link]',
      "1. Tap the link. There's no username or password: the link is your login, so don't share it.",
      '2. Tap "Sign my W-9" and add your Social Security number (about 30 seconds) so we can pay you.',
      '3. Tap "Copy link" to share your referral link with friends, family and people in your network. Let them know you get a referral fee.',
      "Save the page to check what you've earned anytime. Questions? Just reply here.",
    ],
  },
  {
    id: 'partnerReview', group: 'Partners', key: 'sms.review.partner', auto: false,
    name: 'Google review from a partner who’s a customer',
    when: 'When you tap “Ask for a Google review” on a partner. Optional for them; nothing is offered.',
    blanks: ['[first name]', '[review link]'],
    paragraphs: [
      "Hi [first name], it's Cam. Thank you for being a customer and a referral partner!",
      "If you'd like to, an honest Google review about your experience as a customer would mean a lot: [review link]",
      "Please mention that you're also one of our referral partners. Totally optional, and it has nothing to do with your referral fees.",
    ],
  },
];

const byId = Object.fromEntries(TEXT_TEMPLATES.map(t => [t.id, t]));
const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/**
 * The saved text for a template with its blanks filled in.
 * `vars`: { name, carrier, reviewLink, portalLink }.
 */
export function buildText(id, vars = {}) {
  const t = byId[id];
  const body = t.paragraphs
    .map((p, i) => copyValue(`${t.key}.${i + 1}`, p))
    .filter(p => p.trim())
    .join('\n\n')
    .replace(/\[first name\]/gi, firstOf(vars.name))
    .replace(/\[carrier\]/gi, vars.carrier || 'current')
    .replace(/\[review link\]/gi, vars.reviewLink || '')
    .replace(/\[portal link\]/gi, vars.portalLink || '');
  return t.auto && !/\bSTOP\b/.test(body) ? `${body}\n\n${STOP_LINE}` : body;
}
