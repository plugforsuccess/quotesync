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

// What the producer sees for a send. A text the carrier accepted is not "delivered"
// until the phone company says so.
export const SEND_STATUS = {
  requested: { label: 'Sending…', tone: 'pending' },
  queued: { label: 'Sending…', tone: 'pending' },
  sent: { label: 'Sent — waiting on their carrier', tone: 'pending' },
  delivered: { label: 'Delivered', tone: 'good' },
  failed: { label: 'Didn’t go through', tone: 'bad' },
  blocked: { label: 'Not sent — this number texted STOP', tone: 'bad' },
};
export const isFinal = (s) => ['delivered', 'failed', 'blocked'].includes(s);

/** Where a send stands, furthest step first: uploaded, opened, then the text's status. */
export function sendProgress(invite) {
  if (!invite) return null;
  if (invite.upload_count > 0) return { label: 'Uploaded their policy', tone: 'good' };
  if (invite.opened_at) return { label: 'Opened the link', tone: 'good' };
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return { label: 'Link expired', tone: 'muted' };
  return SEND_STATUS[invite.sms_status] || { label: 'Link made', tone: 'muted' };
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
