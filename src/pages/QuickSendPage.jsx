// src/pages/QuickSendPage.jsx
// Quick Send (/qs): while talking to someone, text them a link to upload their dec page —
// name, mobile, Send. Works logged out: this phone was set up once (it keeps a key), or
// the producer signs in with their time-clock PIN for the shift. Uploads land in the
// Rate Checks inbox credited to the producer. Not indexed.

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Loader2, MessageSquare, QrCode, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  quickSend, savedKey, keepPhoneKey, keepPinKey, forgetKeys, deviceLabel,
  sendProgress, isFinal, formatPhoneInput, phoneDigits, validMobile,
} from '../lib/quickSend';

const SCRIPT =
  'This is insuredbycam.com, operated by Cam Wiley Agency, Inc. Would you like me to text a secure link to upload ' +
  'your current declarations page? This sends the link only; optional quote updates can be selected later when you submit it.';

const TONE = {
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
  pending: 'bg-blue-50 text-blue-800 border-blue-200',
  muted: 'bg-slate-50 text-slate-600 border-slate-200',
};
const field = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-lg text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

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
        <header className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">insuredbycam.com</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Quick Send</h1>
          </div>
          {screen === 'ready' && me?.pin && (
            <button type="button" onClick={signOut} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Sign out</button>
          )}
        </header>
        {screen === 'loading' && <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />}
        {screen === 'signin' && <SignIn loggedIn={loggedIn} onDone={signedIn} />}
        {screen === 'off' && (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700">
            Quick Send is turned off for the agency right now. The agency principal can turn it on in Rate Checks → Links sent.
          </p>
        )}
        {screen === 'ready' && <SendForm me={me} onSignedOut={signOut} />}
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

function SendForm({ me, onSignedOut }) {
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
    <div className="space-y-5">
      {result ? <SendResult result={result} onAnother={another} /> : (
        <form onSubmit={send} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">{me?.producer_first ? `Hi ${me.producer_first}. ` : ''}Ask first, then send:</p>
          <blockquote className="rounded-xl bg-slate-100 p-3 text-[15px] leading-relaxed text-slate-800">“{SCRIPT}”</blockquote>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Their name</span>
            <input ref={nameInput} className={field} autoComplete="off" autoCapitalize="words" maxLength={80}
              value={name} onChange={e => setName(e.target.value)} placeholder="Keisha" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Their mobile</span>
            <input className={field} type="tel" inputMode="tel" autoComplete="off" value={phone}
              onChange={e => setPhone(formatPhoneInput(e.target.value))} placeholder="(404) 555-1212" />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button type="submit" disabled={!ok || busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MessageSquare className="h-5 w-5" aria-hidden="true" />}
            Send Requested DEC Link
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            Pressing Send confirms they asked for this one text. It sends the upload link only — it doesn&apos;t sign them up for other texts.
          </p>
        </form>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Your recent sends</h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {recent.map(inv => {
              const p = sendProgress(inv);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{inv.first_name || 'No name'}</p>
                    <p className="text-sm text-slate-500">{formatPhoneInput(inv.phone)} · {ago(inv.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE[p.tone]}`}>{p.label}</span>
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
  const p = already ? { label: 'Already texted today — no second text sent', tone: 'muted' } : sendProgress(invite);
  const status = invite?.sms_status;
  const fallback = already || status === 'failed' || status === 'blocked';
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canvas = useRef(null);
  useEffect(() => {
    if (showQr && canvas.current) QRCode.toCanvas(canvas.current, link, { width: 220, margin: 1 }).catch(() => {});
  }, [showQr, link]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* shown below */ }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" role="status" aria-live="polite">
      <p className="text-sm text-slate-600">
        {invite?.first_name} · {formatPhoneInput(invite?.phone)}
        {already && invite?.producer_name ? ` · sent by ${invite.producer_name}` : ''}
      </p>
      <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${TONE[p.tone]}`}>
        {p.tone === 'pending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {p.tone === 'good' && <Check className="h-4 w-4" aria-hidden="true" />}
        {p.tone === 'bad' && <X className="h-4 w-4" aria-hidden="true" />}
        {p.label}
      </p>
      {status === 'failed' && invite?.sms_error && <p className="mt-2 text-sm text-slate-600">{invite.sms_error}</p>}
      {!fallback && <p className="mt-2 text-sm text-slate-600">Tell them to check their texts. The link works for 7 days.</p>}
      {fallback && <p className="mt-2 text-sm text-slate-600">Show them the code to scan, or copy the link.</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-3 font-semibold text-slate-800">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={() => setShowQr(v => !v)} aria-expanded={showQr} className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-3 font-semibold text-slate-800">
          <QrCode className="h-4 w-4" aria-hidden="true" /> {showQr ? 'Hide code' : 'Show QR'}
        </button>
      </div>
      {showQr && <canvas ref={canvas} className="mx-auto mt-4 block" aria-label="QR code for the upload link" />}
      <button type="button" onClick={onAnother} className="mt-4 w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">Send another</button>
    </div>
  );
}
