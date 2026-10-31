// src/pages/QuickSendPage.jsx
// Quick Send (/qs): while talking to someone, text them a link to upload their dec page —
// name, mobile, Send. Works logged out: this phone was set up once (it keeps a key), or
// the producer signs in with their time-clock PIN for the shift. Uploads land in the
// Rate Checks inbox credited to the producer. Not indexed.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, QrCode, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  quickSend, savedKey, keepPhoneKey, keepPinKey, forgetKeys, deviceLabel,
  sendProgress, sendSteps, STEPS, shortAgo, isFinal, formatPhoneInput, phoneDigits, validMobile,
} from '../lib/quickSend';

// What the producer says before sending (recorded on each send as qs-script-v1 by the edge function).
const SCRIPT =
  'Can I text you a secure link to upload your current dec page? It comes from insuredbycam.com, operated by ' +
  'Cam Wiley Agency, Inc. It\'s just the link, nothing else.';

// One dot colour per state, used in the recent list and the result's headline.
const DOT = { good: 'bg-emerald-500', bad: 'bg-red-500', pending: 'bg-blue-500', muted: 'bg-slate-300' };
const field = 'mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';
const label = 'text-sm font-semibold text-slate-700';

export default function QuickSendPage() {
  const [screen, setScreen] = useState('loading'); // loading | signin | off | ready
  const [me, setMe] = useState(null);              // { producer_first, pin }
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    document.title = 'Quick Send | insuredbycam';
    let gone = false;
    (async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
      if (!gone) setLoggedIn(!!data?.session);
      const key = savedKey();
      if (!key) { if (!gone) setScreen('signin'); return; }
      try {
        const who = await quickSend('whoami', { device_key: key });
        if (gone) return;
        setMe(who);
        setScreen(who.enabled ? 'ready' : 'off');
      } catch (e) {
        if (gone) return;
        if (e.status === 401) forgetKeys();
        setScreen('signin');
      }
    })();
    return () => { gone = true; };
  }, []);

  const signedIn = (who) => { setMe(who); setScreen(who.enabled === false ? 'off' : 'ready'); };
  const signOut = async () => {
    const key = savedKey();
    if (me?.pin && key) await quickSend('sign_out', { device_key: key }).catch(() => {});
    forgetKeys();
    setMe(null);
    setScreen('signin');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <meta name="robots" content="noindex, nofollow" />
      <main className="mx-auto max-w-md px-4 pb-10 pt-6">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">insuredbycam</p>
            <h1 className="mt-0.5 text-[28px] font-extrabold leading-none tracking-tight text-slate-900">Quick Send</h1>
          </div>
          {screen === 'ready' && me?.producer_first && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{me.producer_first}</span>
              {me.pin && <><span aria-hidden="true">·</span><button type="button" onClick={signOut} className="font-semibold text-blue-700">Sign out</button></>}
            </p>
          )}
        </header>
        {screen === 'loading' && <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />}
        {screen === 'signin' && <SignIn loggedIn={loggedIn} onDone={signedIn} />}
        {screen === 'off' && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700">
            Quick Send is turned off for the agency right now. The agency principal can turn it on in Rate Checks → Links sent.
          </p>
        )}
        {screen === 'ready' && <SendForm onSignedOut={signOut} />}
      </main>
    </div>
  );
}

function SignIn({ loggedIn, onDone }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signInWithPin = async (value) => {
    setBusy(true); setError('');
    try {
      const r = await quickSend('pin', { pin: value, label: deviceLabel() });
      keepPinKey(r.device_key);
      const who = await quickSend('whoami', { device_key: r.device_key });
      onDone(who);
    } catch (e) {
      setError(e.message); setPin('');
    } finally { setBusy(false); }
  };
  const setUpPhone = async () => {
    setBusy(true); setError('');
    try {
      const r = await quickSend('pair', { label: deviceLabel() }, { withLogin: true });
      keepPhoneKey(r.device_key);
      const who = await quickSend('whoami', { device_key: r.device_key });
      onDone(who);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {loggedIn && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="font-semibold text-slate-900">Your phone?</p>
          <p className="mt-1 text-sm text-slate-600">Set it up once and Quick Send opens without a PIN or a login from now on.</p>
          <button type="button" onClick={setUpPhone} disabled={busy}
            className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
            Set up Quick Send on this phone
          </button>
        </div>
      )}
      <form className="rounded-2xl border border-slate-200 bg-white p-4" onSubmit={e => { e.preventDefault(); if (pin.length === 4) signInWithPin(pin); }}>
        <label htmlFor="qs-pin" className="font-semibold text-slate-900">{loggedIn ? 'Or use your time-clock PIN' : 'Your time-clock PIN'}</label>
        <p className="mt-1 text-sm text-slate-600">Signs you in on this phone until you close it, or for 12 hours.</p>
        <input id="qs-pin" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} autoFocus={!loggedIn}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setPin(v); if (v.length === 4) signInWithPin(v); }}
          className={`${field} text-center font-mono text-2xl tracking-[0.6em]`} placeholder="••••" aria-describedby="qs-pin-error" disabled={busy} />
        {error && <p id="qs-pin-error" className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
      </form>
      {!loggedIn && (
        <p className="px-1 text-sm text-slate-500">
          Your own phone? Log in to QuoteSync on it once, open this page, and tap “Set up Quick Send on this phone.”
        </p>
      )}
    </div>
  );
}

function SendForm({ onSignedOut }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { invite, link, already_sent }
  const [recent, setRecent] = useState([]);
  const requestId = useRef(crypto.randomUUID());
  const nameInput = useRef(null);

  const loadRecent = () => quickSend('recent', { device_key: savedKey() }).then(r => setRecent(r.invites || [])).catch(() => {});
  useEffect(() => { loadRecent(); nameInput.current?.focus(); }, []);

  // Follow the text until it's delivered or failed (about two minutes at most).
  const inviteId = result?.invite?.id;
  const finalNow = isFinal(result?.invite?.sms_status);
  useEffect(() => {
    if (!inviteId || finalNow || result?.already_sent) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      try {
        const r = await quickSend('status', { device_key: savedKey(), invite_id: inviteId });
        setResult(cur => (cur?.invite?.id === inviteId ? { ...cur, invite: r.invite } : cur));
        if (isFinal(r.invite?.sms_status) || tries >= 40) { clearInterval(t); loadRecent(); }
      } catch { clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [inviteId, finalNow, result?.already_sent]);

  const ok = name.trim() && validMobile(phone);
  const send = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setError('');
    try {
      const r = await quickSend('send', { device_key: savedKey(), request_id: requestId.current, first_name: name.trim(), phone: phoneDigits(phone) });
      setResult(r);
      loadRecent();
    } catch (err) {
      if (err.status === 401) { onSignedOut(); return; }
      setError(err.message);
    } finally { setBusy(false); }
  };
  const another = () => {
    requestId.current = crypto.randomUUID();
    setResult(null); setName(''); setPhone(''); setError('');
    setTimeout(() => nameInput.current?.focus(), 0);
  };

  return (
    <div className="space-y-6">
      {result ? <SendResult result={result} onAnother={another} /> : (
        <form onSubmit={send} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Ask first</p>
          <p className="mt-2 border-l-4 border-blue-200 pl-3 text-[15px] leading-relaxed text-slate-700">“{SCRIPT}”</p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className={label}>Name</span>
              <input ref={nameInput} className={field} autoComplete="off" autoCapitalize="words" maxLength={80}
                value={name} onChange={e => setName(e.target.value)} placeholder="First name" />
            </label>
            <label className="block">
              <span className={label}>Mobile number</span>
              <input className={field} type="tel" inputMode="tel" autoComplete="off" value={phone}
                onChange={e => setPhone(formatPhoneInput(e.target.value))} placeholder="(404) 555-1212" />
            </label>
          </div>
          {error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{error}</p>}
          <button type="submit" disabled={!ok || busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white shadow-sm active:bg-blue-800 disabled:bg-slate-300 disabled:shadow-none">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
            Send Requested DEC Link
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">Only send if they said yes. Sending records that they asked for this text.</p>
        </form>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="qs-recent">
          <h2 id="qs-recent" className="px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Recent</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {recent.map(inv => {
              const p = sendProgress(inv);
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{inv.first_name || 'No name'}</p>
                    <p className="whitespace-nowrap text-sm tabular-nums text-slate-500">{formatPhoneInput(inv.phone)} · {shortAgo(inv.created_at)}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <span className={`h-2 w-2 rounded-full ${DOT[p.tone]}`} aria-hidden="true" />{p.short}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function SendResult({ result, onAnother }) {
  const { invite, link, already_sent: already } = result;
  const status = invite?.sms_status;
  const name = invite?.first_name || 'them';
  const { done, stopped } = sendSteps(invite);
  const blocked = status === 'blocked';
  const failed = status === 'failed' && stopped;
  const sending = !already && !stopped && done === 0;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(blocked || failed);
  const canvas = useRef(null);
  useEffect(() => { if (blocked || failed) setShowQr(true); }, [blocked, failed]);
  useEffect(() => {
    if (showQr && canvas.current) QRCode.toCanvas(canvas.current, link, { width: 200, margin: 1 }).catch(() => {});
  }, [showQr, link]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const headline = already ? `${name} already has a link` : blocked ? `${name} opted out of texts`
    : failed ? `Couldn’t text ${name}` : sending ? `Texting ${name}…` : `Texted ${name}`;
  const note = already
    ? `${invite?.producer_name ? `${invite.producer_name} sent it` : 'It was sent'} in the last day, so no second text went out. Show the code or copy the link if they need it again.`
    : blocked ? 'They replied STOP to an earlier text, so we can’t text them. Have them scan the code instead.'
      : failed ? `${invite?.sms_error ? `${invite.sms_error}. ` : ''}Have them scan the code instead, or check the number and send again.`
        : `Tell ${name} to open the text from insuredbycam.com. The link works for 7 days.`;
  const tone = blocked || failed ? 'bad' : sending ? 'pending' : 'good';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone === 'bad' ? 'bg-red-50 text-red-600' : tone === 'pending' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-600'}`}>
          {tone === 'bad' ? <X className="h-6 w-6" aria-hidden="true" /> : tone === 'pending' ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Check className="h-6 w-6" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <p className="text-xl font-extrabold leading-tight tracking-tight text-slate-900">{headline}</p>
          <p className="mt-0.5 text-sm tabular-nums text-slate-500">{formatPhoneInput(invite?.phone)}</p>
        </div>
      </div>

      {!blocked && !failed && (
        <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label={`Progress: ${done} of 4 steps`}>
          {STEPS.map((step, i) => (
            <li key={step} className="min-w-0">
              <span className={`block h-1.5 rounded-full ${i < done ? 'bg-emerald-500' : i === done && !already ? 'animate-pulse bg-blue-200' : 'bg-slate-200'}`} />
              <span className={`mt-1.5 block truncate text-xs font-semibold ${i < done ? 'text-slate-800' : 'text-slate-400'}`}>{step}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{note}</p>

      {showQr && <canvas ref={canvas} className="mx-auto mt-4 block rounded-lg border border-slate-200" aria-label="QR code for the upload link" />}

      <button type="button" onClick={onAnother} className="mt-5 w-full rounded-xl bg-blue-700 px-4 py-3.5 text-base font-bold text-white shadow-sm active:bg-blue-800">Send another</button>
      <div className="mt-3 flex items-center justify-center gap-6 text-sm font-semibold text-blue-700">
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 py-1">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={() => setShowQr(v => !v)} aria-expanded={showQr} className="inline-flex items-center gap-1.5 py-1">
          <QrCode className="h-4 w-4" aria-hidden="true" />{showQr ? 'Hide QR code' : 'Show QR code'}
        </button>
      </div>
    </div>
  );
}
