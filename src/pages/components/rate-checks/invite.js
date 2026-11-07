// src/pages/components/rate-checks/invite.js
// The short link a producer sends, and the message that carries it.
import { buildText } from '../../../lib/textTemplates.js';

// Links should carry the public site's domain even when created from the app's
// domain. Set VITE_RATE_CHECK_LINK_BASE (e.g. https://insuredbycam.com) on Vercel.
const LINK_BASE = (import.meta.env.VITE_RATE_CHECK_LINK_BASE || '').replace(/\/+$/, '');
export const inviteUrl = (code) => `${LINK_BASE || window.location.origin}/r/${code}`;

// Opens the producer's own Messages app with the text written. Works as a link
// on a phone, and as a QR code scanned from a tablet that can't text.
export const smsUrl = (invite, message) => `sms:${invite.phone ? `+1${invite.phone}` : ''}?&body=${encodeURIComponent(message)}`;

// What the customer receives (edited on the Texts & Scripts page: Send a Link).
export function inviteMessage(invite, producerFirst) {
  return buildText('invite', { name: invite.first_name, producer: producerFirst || 'Cam', metAt: invite.event_name, link: inviteUrl(invite.code) });
}
