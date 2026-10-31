// src/lib/quickSendFormat.js
// Quick Send display helpers — pure (no Supabase), so they're unit-tested.

// "iPhone · Safari" — so the agency can tell set-up phones apart.
export function deviceLabel(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Phone';
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : null;
  return browser ? `${device} · ${browser}` : device;
}

// What the producer sees for a send: a full line for the result card, a word for the list.
// A text the carrier accepted isn't "delivered" until the phone company says so.
export const SEND_STATUS = {
  requested: { label: 'Sending…', short: 'Sending', tone: 'pending' },
  queued: { label: 'Sending…', short: 'Sending', tone: 'pending' },
  sent: { label: 'Sent, waiting on their carrier', short: 'Sent', tone: 'pending' },
  delivered: { label: 'Delivered', short: 'Delivered', tone: 'good' },
  failed: { label: 'The text didn’t go through', short: 'Failed', tone: 'bad' },
  blocked: { label: 'Not sent. This number opted out of texts.', short: 'Opted out', tone: 'bad' },
};
export const isFinal = (s) => ['delivered', 'failed', 'blocked'].includes(s);

/** Where a send stands, furthest step first: uploaded, opened, then the text's status. */
export function sendProgress(invite) {
  if (!invite) return null;
  if (invite.upload_count > 0) return { label: 'Uploaded their policy', short: 'Uploaded', tone: 'good' };
  if (invite.opened_at) return { label: 'Opened the link', short: 'Opened', tone: 'good' };
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return { label: 'Link expired', short: 'Expired', tone: 'muted' };
  return SEND_STATUS[invite.sms_status] || { label: 'Link ready', short: 'Ready', tone: 'muted' };
}

// The four steps a send goes through, and how many are done. `stopped` when the text failed
// or the number opted out (nothing after that will happen on its own).
export const STEPS = ['Sent', 'Delivered', 'Opened', 'Uploaded'];
export function sendSteps(invite) {
  if (!invite) return { done: 0, stopped: false };
  const stopped = ['failed', 'blocked'].includes(invite.sms_status) && !invite.opened_at && !(invite.upload_count > 0);
  const done = invite.upload_count > 0 ? 4 : invite.opened_at ? 3
    : invite.sms_status === 'delivered' ? 2 : invite.sms_status === 'sent' ? 1 : 0;
  return { done, stopped };
}

/** "now", "8m", "3h", "2d" — fits on one line next to a phone number. */
export function shortAgo(iso, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

/** (404) 555-1212 as they type. */
export function formatPhoneInput(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export const phoneDigits = (s) => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
export const validMobile = (s) => /^[2-9]\d{2}[2-9]\d{6}$/.test(phoneDigits(s));
