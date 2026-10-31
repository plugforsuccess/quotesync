// src/lib/quickSend.js
// Quick Send (/qs): text someone a dec-page upload link while you're talking to them.
// The page works logged out — the rate-check-quick-send edge function knows the
// producer by a key kept on this phone (set up once) or a one-shift key from a PIN.

import { supabase } from './supabase';

const URL_ = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check-quick-send`
  : '/functions/v1/rate-check-quick-send';

// A set-up phone keeps its key; a PIN sign-in lasts until the tab closes (or 12 hours).
const PHONE_KEY = 'qs_quick_send_key';
const PIN_KEY = 'qs_quick_send_pin_key';
const read = (store, k) => { try { return store.getItem(k); } catch { return null; } };
const write = (store, k, v) => { try { if (v) store.setItem(k, v); else store.removeItem(k); } catch { /* private mode */ } };

export const savedKey = () => read(localStorage, PHONE_KEY) || read(sessionStorage, PIN_KEY);
export const keepPhoneKey = (key) => write(localStorage, PHONE_KEY, key);
export const keepPinKey = (key) => write(sessionStorage, PIN_KEY, key);
export const forgetKeys = () => { write(localStorage, PHONE_KEY, null); write(sessionStorage, PIN_KEY, null); };

export class QuickSendError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}

/** Call the edge function. `withLogin` sends the logged-in session (setup and settings). */
export async function quickSend(mode, payload = {}, { withLogin = false } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' };
  if (withLogin) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new QuickSendError('Log in to QuoteSync first.', 'login', 401);
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify({ mode, ...payload }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new QuickSendError(data.error || 'Something went wrong. Try again.', data.code, res.status);
  return data;
}

export { deviceLabel, SEND_STATUS, isFinal, sendProgress, formatPhoneInput, phoneDigits, validMobile } from './quickSendFormat';
