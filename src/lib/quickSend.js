// src/lib/quickSend.js
// Quick Send (/qs): text someone a dec-page upload link while you're talking to them.
// No login: the producer signs in with their Quick Send PIN, and the rate-check-quick-send
// edge function knows them by the key it hands back (kept on their own phone).

const URL_ = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check-quick-send`
  : '/functions/v1/rate-check-quick-send';

// "Keep me signed in" keeps the key on this phone; otherwise it lasts until the tab closes (or 12 hours).
const PHONE_KEY = 'qs_quick_send_key';
const PIN_KEY = 'qs_quick_send_pin_key';
const read = (store, k) => { try { return store.getItem(k); } catch { return null; } };
const write = (store, k, v) => { try { if (v) store.setItem(k, v); else store.removeItem(k); } catch { /* private mode */ } };

export const savedKey = () => read(localStorage, PHONE_KEY) || read(sessionStorage, PIN_KEY);
export const keepKey = (key, remember) => write(remember ? localStorage : sessionStorage, remember ? PHONE_KEY : PIN_KEY, key);
export const forgetKeys = () => { write(localStorage, PHONE_KEY, null); write(sessionStorage, PIN_KEY, null); };

export class QuickSendError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

/** Call the edge function (no login: the key or PIN in the payload says who's sending). */
export async function quickSend(mode, payload = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' };
  const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify({ mode, ...payload }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new QuickSendError(data.error || 'Something went wrong. Try again.', data.code, res.status);
  return data;
}

export { deviceLabel, SEND_STATUS, isFinal, sendProgress, sendSteps, STEPS, shortAgo, formatPhoneInput, phoneDigits, validMobile } from './quickSendFormat';
