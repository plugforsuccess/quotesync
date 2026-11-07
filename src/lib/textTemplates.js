// src/lib/textTemplates.js
// Every text and script, in one list: what producers say, what they text, and what
// customers and partners receive. The owner edits them on the Texts & Scripts page
// (/agency/texts, copy editor pencil; principals only), paragraph by paragraph (keys
// `${key}.1`, `${key}.2`, …). Blanks like [first name] fill in when a text is sent.
// Automatic texts always end with "Reply STOP to opt out." — that line is added when
// it's sent and can't be edited away.
//
// kind: 'text' (default) is sent as a text; 'say' is said out loud.
// textIt: a text with no one person to send it to, so the card opens Messages.
// kind 'email' has a subject (key `${key}.subject`); the unsubscribe line is added when sent.
//
// The automatic ones are sent by edge functions that keep a copy of these defaults
// (rate-check-outcome; rate-check-quick-send for the Quick Send script and text);
// change a default here, change it there too.
import { copyValue } from './copyValues.js';

export const STOP_LINE = 'Reply STOP to opt out.';

export const TEXT_GROUPS = ['Getting the Link Out', 'After a Quote', 'After They Buy', 'Partners', 'Drivers Ed Emails'];

export const TEXT_TEMPLATES = [
  // ── Getting the link out ───────────────────────────────────────────────────
  {
    id: 'room', group: 'Getting the Link Out', key: 'script.room', kind: 'say',
    name: 'Say It in the Room',
    when: 'A meeting, a club, a group of friends. About 30 seconds.',
    blanks: [],
    paragraphs: [
      "Quick ask. I built a new tool on my website: you snap a photo of your car or home insurance declarations page, and it reads it in seconds. I'm testing it and I'd love 10 of you to try it this week.",
      "It's insuredbycam.com. It takes about a minute, there's nothing to download, your info stays private, and nobody's going to blow up your phone.",
      "And if you want, I'll check your rate and tell you honestly if I can beat it. If I can't, I'll tell you that too. Either way, you'd be helping me out a lot.",
    ],
  },
  {
    id: 'roomText', group: 'Getting the Link Out', key: 'script.room-text', textIt: true,
    name: 'Text Right After',
    when: 'Send it to the group chat, or one by one, while it’s fresh.',
    blanks: [],
    paragraphs: [`Thanks for hearing me out 🙏 Here's the link: insuredbycam.com. Tap "Check My Rate" and upload your policy (the PDF from your insurance app, or photos of every page). Takes about a minute, nothing to download. If you want me to check your rate too, leave the box checked and I'll text you. Appreciate y'all!`],
  },
  {
    id: 'invite', group: 'Getting the Link Out', key: 'sms.invite.link',
    name: 'Send a Link',
    when: 'When you tap Send a Link on Rate Checks. It opens Messages on your phone.',
    blanks: ['[first name]', '[producer]', '[where we met]', '[link]'],
    paragraphs: ["Hi [first name], it's [producer] with Allstate[where we met]. Snap a photo of your current policy here and we'll check if we can beat it: [link]"],
  },
  {
    id: 'qsAsk', group: 'Getting the Link Out', key: 'script.qs.ask', kind: 'say', recorded: true,
    name: 'Quick Send: Ask First',
    when: 'Said before you tap Send on Quick Send.',
    blanks: [],
    paragraphs: ["Can I text you a secure link to upload your current dec page? It comes from insuredbycam.com, operated by Cam Wiley Agency, Inc. It's just the link, nothing else."],
  },
  {
    id: 'qsAgency', group: 'Getting the Link Out', key: 'sms.qs.agency', auto: true, recorded: true,
    name: 'Quick Send: The Text',
    when: 'Sent from the agency’s number when you tap Send on Quick Send.',
    blanks: ['[link]'],
    paragraphs: ['insuredbycam.com (Cam Wiley Agency, Inc.): Here is the secure link you requested to upload your dec page for an agent-prepared quote: [link]'],
  },
  {
    id: 'qsOwn', group: 'Getting the Link Out', key: 'sms.qs.own',
    name: 'Quick Send: From Your Phone',
    when: 'Until the agency’s number is set up: Send Text on Quick Send opens Messages with this.',
    blanks: ['[first name]', '[producer]', '[link]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. Here's the link you asked for to upload your policy for a quote: [link]"],
  },
  {
    id: 'nudge', group: 'Getting the Link Out', key: 'sms.invite.nudge',
    name: 'Nudge',
    when: 'When you tap Nudge on Links Sent: they opened the link but haven’t uploaded.',
    blanks: ['[first name]', '[link]'],
    paragraphs: ["Hi [first name], saw you opened the link. Just snap a photo of your dec page and I'll do the rest: [link]"],
  },
  {
    id: 'hold', group: 'After a Quote', key: 'sms.quote.hold', auto: false,
    name: 'Working on It',
    when: 'When you tap “Text now” on an inbox card.',
    blanks: ['[first name]'],
    paragraphs: ["Hi [first name], it's Cam with Cam Wiley Agency. I'm working on your quote now and I'll have it to you shortly."],
  },
  {
    id: 'ready', group: 'After a Quote', key: 'sms.quote.ready', auto: true,
    name: 'Your Quote Is Ready',
    when: 'Sent automatically when your quote beats their price. Keep “Reply Y”: their Y is what tells you to call.',
    blanks: ['[first name]'],
    paragraphs: [
      "Hi [first name], it's Cam Wiley Agency. Your Allstate quote is ready and it looks like we can save you money.",
      "Reply Y and we'll call you to go over it.",
    ],
  },
  {
    id: 'lost', group: 'After a Quote', key: 'sms.quote.lost', auto: true,
    name: 'We Couldn’t Beat It',
    when: 'Sent automatically when your quote comes in higher than what they pay.',
    blanks: ['[first name]', '[carrier]'],
    paragraphs: [
      "Hi [first name], it's Cam Wiley Agency. We checked your [carrier] policy and you're in good shape: we couldn't beat it today.",
      "We'll reach out if that changes.",
    ],
  },
  {
    id: 'contactSaves', group: 'After a Quote', key: 'sms.contact.saves',
    name: 'Contact: It Saves Them Money',
    when: 'Contact step in the sales workspace, when the Allstate quote is lower.',
    blanks: ['[first name]', '[producer]', '[Allstate price]', '[savings]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. Good news: the same coverage with Allstate comes to [Allstate price] a year, saving you [savings]. Reply Y and I'll call to set it up."],
  },
  {
    id: 'contactSame', group: 'After a Quote', key: 'sms.contact.same',
    name: 'Contact: About the Same',
    when: 'Contact step, when the quote is within 1% (or $25) of what they pay.',
    blanks: ['[first name]', '[producer]', '[Allstate price]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. Your Allstate quote came in about the same as you pay now ([Allstate price] a year). Bundling and having a local agent may still make it worth a look. Reply Y for a quick call."],
  },
  {
    id: 'contactMore', group: 'After a Quote', key: 'sms.contact.more',
    name: 'Contact: It Costs More',
    when: 'Contact step, when the Allstate quote is higher.',
    blanks: ['[first name]', '[producer]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. I checked your rate, and your current price is hard to beat right now. I'd rather tell you straight. We'll check again before your next renewal."],
  },
  {
    id: 'contactQuoted', group: 'After a Quote', key: 'sms.contact.quoted',
    name: 'Contact: Quote Ready (Nothing to Compare)',
    when: 'Contact step for a winback or a lead with no uploaded policy.',
    blanks: ['[first name]', '[producer]', '[Allstate price]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. I put together a new Allstate quote for you: [Allstate price] a year. Reply Y and I'll call to go over it."],
  },
  {
    id: 'driversEd', group: 'After a Quote', key: 'sms.contact.drivers-ed',
    name: 'Drivers Ed Link',
    when: 'Send Drivers Ed Link in the Contact step (auto quotes): the course earns the Allstate defensive driving discount.',
    blanks: ['[first name]', '[producer]', '[course link]'],
    paragraphs: ["Hi [first name], it's [producer] with Cam Wiley Agency. Allstate gives a discount for completing a defensive driving course, and you can take Georgia's 6-hour course online at your own pace: [course link] When you pass, your certificate comes straight to us and we'll add the discount to your Allstate quote."],
  },
  {
    id: 'reconnect', group: 'After a Quote', key: 'script.reconnect', kind: 'say',
    name: 'Reconnect After a Quote That Came in High',
    when: 'Someone you quoted before and never followed up with.',
    blanks: [],
    paragraphs: [
      "Hey, I owe you a follow-up. I quoted your insurance a while back, and honestly, I came in high, so I didn't want to waste your time with a number that didn't help you. That's on me, I should've told you.",
      "Rates have moved since then, and I've got a new tool on my website that reads your policy in about a minute. If you send me your current dec pages, I'll take a fresh look. If I can't beat it, I'll tell you straight up. No pressure either way.",
    ],
  },
  {
    id: 'reconnectText', group: 'After a Quote', key: 'script.reconnect-text', textIt: true,
    name: 'Reconnect: Text Version',
    when: 'If you can’t catch them in person.',
    blanks: [],
    paragraphs: [`Hey, I owe you a follow-up on that quote. I came in high last time, so I didn't want to waste your time, my bad for going quiet. Rates have moved, so I'd like to take a fresh look: insuredbycam.com, tap "Check My Rate" (about a minute, nothing to download). If I can't get you a cheaper rate, I'll tell you straight up.`],
  },
  {
    id: 'review', group: 'After They Buy', key: 'sms.review.customer', auto: true,
    name: 'Thank You + Google Review',
    when: 'Sent automatically when you mark a rate check bound. Or tap to text it yourself.',
    blanks: ['[first name]', '[review link]'],
    paragraphs: [
      "Hi [first name], it's Cam with Cam Wiley Agency. Thank you for trusting us with your insurance!",
      'If you have a minute, an honest Google review helps other Georgia families find us: [review link]',
      'Questions about your policy? Just reply here.',
    ],
  },
  {
    id: 'share', group: 'Partners', key: 'script.share', kind: 'say', pitch: true,
    name: 'Ask Them to Share',
    when: 'Anyone well connected: a chapter president, a coach, a pastor. Then send the pitch.',
    blanks: [],
    paragraphs: ["Even if I can't beat yours, would you be open to sharing this with people you know? You'd get a referral fee for every household that sends their policy through your link, and they don't have to buy anything."],
  },
  {
    id: 'pitch', group: 'Partners', key: 'sms.partner.pitch', pitch: true,
    name: 'The Partner Pitch',
    when: 'Send Pitch: this text plus the four pictures of how it works.',
    blanks: [],
    paragraphs: ['Want to make some extra pocket money? You share your link. When people you know use it to check their insurance rate, you get a referral fee. They don’t have to buy anything. Here’s how it works 👇'],
  },
  {
    id: 'partnerWelcome', group: 'Partners', key: 'sms.partner.welcome', auto: false,
    name: 'Welcome a New Partner',
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
    name: 'Google Review From a Partner Who’s a Customer',
    when: 'When you tap “Ask for a Google review” on a partner. Optional for them; nothing is offered.',
    blanks: ['[first name]', '[review link]'],
    paragraphs: [
      "Hi [first name], it's Cam with Cam Wiley Agency. Thank you for being a customer and a referral partner!",
      "If you'd like to, an honest Google review about your experience as a customer would mean a lot: [review link]",
      "Please mention that you're also one of our referral partners. Totally optional, and it has nothing to do with your referral fees.",
    ],
  },
  // ── Drivers Ed emails (sent by supabase/functions/dd-reminders) ───────────────
  {
    id: 'ddRetake', group: 'Drivers Ed Emails', key: 'email.dd.retake', kind: 'email', auto: true,
    name: 'Retake Before Your Discount Lapses',
    when: 'Emailed 60 and 14 days before the deadline: the last renewal before the 36-month certificate ends (or the 36 months, if we don’t have their renewal).',
    blanks: ['[first name]', '[passed date]', '[deadline]', '[course link]'],
    subject: 'Keep your Allstate defensive driving discount',
    paragraphs: [
      'Hi [first name],',
      'Your defensive driving certificate from [passed date] needs a refresh by [deadline] to keep your Allstate discount at your next renewal.',
      "Retake Georgia's 6-hour course online, at your own pace: [course link]",
      "When you pass, your new certificate comes straight to us and we'll keep your discount going.",
      'Cam Wiley Agency',
    ],
  },
  {
    id: 'ddStall', group: 'Drivers Ed Emails', key: 'email.dd.stall', kind: 'email', auto: true,
    name: 'Pick Up Where You Left Off',
    when: 'Emailed 3 and 10 days after someone enrolls, if they haven’t passed yet.',
    blanks: ['[first name]', '[modules done]', '[modules total]', '[course link]'],
    subject: 'Pick up your defensive driving course where you left off',
    paragraphs: [
      'Hi [first name],',
      "You're [modules done] of [modules total] modules into Georgia's 6-hour defensive driving course. Pick up where you left off: [course link]",
      'Once you pass the final exam, your certificate comes straight to us for your Allstate discount.',
      'Cam Wiley Agency',
    ],
  },
];

const byId = Object.fromEntries(TEXT_TEMPLATES.map(t => [t.id, t]));
const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

const usd = (n) => `$${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US')}`;

/** The saved paragraphs of a template (the owner's edits, else the defaults). */
export const templateText = (id) => {
  const t = byId[id];
  return t.paragraphs.map((p, i) => copyValue(`${t.key}.${i + 1}`, p)).filter(p => p.trim()).join('\n\n');
};

/**
 * The saved text for a template with its blanks filled in.
 * `vars`: { name, carrier, reviewLink, portalLink, producer, link, metAt, allstate, savings }.
 */
export function buildText(id, vars = {}) {
  const t = byId[id];
  const body = templateText(id)
    .replace(/\[first name\]/gi, firstOf(vars.name))
    .replace(/\[producer\]/gi, vars.producer || 'Cam')
    .replace(/\[where we met\]/gi, vars.metAt ? ` (we met at ${vars.metAt})` : '')
    .replace(/\[link\]/gi, vars.link || '')
    .replace(/\[course link\]/gi, vars.courseLink || '')
    .replace(/\[passed date\]/gi, vars.passedDate || '')
    .replace(/\[deadline\]/gi, vars.deadline || '')
    .replace(/\[modules done\]/gi, String(vars.done ?? ''))
    .replace(/\[modules total\]/gi, String(vars.total ?? ''))
    .replace(/\[Allstate price\]/gi, usd(vars.allstate))
    .replace(/\[savings\]/gi, usd(vars.savings))
    .replace(/\[carrier\]/gi, vars.carrier || 'current')
    .replace(/\[review link\]/gi, vars.reviewLink || '')
    .replace(/\[portal link\]/gi, vars.portalLink || '');
  let out = body;
  // A text that's meant to carry the link always does, even if an edit dropped it.
  if (vars.link && t.blanks.includes('[link]') && !out.includes(vars.link)) out += ` ${vars.link}`;
  if (vars.courseLink && t.blanks.includes('[course link]') && !out.includes(vars.courseLink)) out += ` ${vars.courseLink}`;
  // A text that's meant to carry the review link always does, even if an edit dropped it.
  if (vars.reviewLink && t.blanks.includes('[review link]') && !out.includes(vars.reviewLink)) out += `\n\n${vars.reviewLink}`;
  if (t.auto && t.kind !== 'email' && !/\bSTOP\b/.test(out)) out += `\n\n${STOP_LINE}`;
  return plainQuotes(out);
}

// iPhone keyboards type curly quotes; one curly quote makes a text bill as a
// "unicode" text (70 characters a segment instead of 160). Straight quotes read the same.
export const plainQuotes = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

/** How many SMS segments a text bills as (GSM 160/153, unicode 70/67). */
export function segments(text) {
  const gsm = /^[\n\r\x20-\x7E\u00A3\u00A5\u00E8\u00E9\u00F9\u00EC\u00F2\u00C7\u00D8\u00F8\u00C5\u00E5\u00C6\u00E6\u00DF\u00C9\u00C4\u00D6\u00D1\u00DC\u00A7\u00BF\u00E4\u00F6\u00F1\u00FC\u00E0]*$/.test(text);
  const [one, many] = gsm ? [160, 153] : [70, 67];
  return text.length <= one ? 1 : Math.ceil(text.length / many);
}

/** Saved paragraphs that dropped something the text needs. */
export function templateWarnings(id) {
  const t = byId[id];
  const saved = t.paragraphs.map((p, i) => copyValue(`${t.key}.${i + 1}`, p)).join(' ');
  const w = [];
  if (id === 'ready' && !/\breply\s+y\b/i.test(saved)) w.push('“Reply Y” is missing: their Y is what tells you to call.');
  const optional = ['[first name]', '[carrier]', '[producer]', '[where we met]', '[Allstate price]', '[savings]', '[passed date]', '[deadline]', '[modules done]', '[modules total]'];
  const addedAtEnd = ['[review link]', '[link]', '[course link]'];
  for (const b of t.blanks) if (!optional.includes(b) && !saved.toLowerCase().includes(b.toLowerCase())) w.push(`${b} is missing${addedAtEnd.includes(b) ? ': it’s added at the end' : ''}.`);
  return w;
}
