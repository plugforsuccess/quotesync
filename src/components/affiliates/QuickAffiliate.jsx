// src/components/affiliates/QuickAffiliate.jsx
// Quick Send → Affiliate (principal only): sign someone up as an affiliate on the spot,
// then text them their Affiliate Portal link. They open it from the text in their phone's
// own browser: sign the W-9, then save "Affiliate Portal" and "Affiliate Link" to their
// Home Screen. Texts go from your phone until Twilio is live.
import { useRef, useState } from 'react';
import { Check, Copy, Loader2, MessageSquare, UserPlus } from 'lucide-react';
import { T } from '../SiteCopy';
import { buildText } from '../../lib/textTemplates';
import { formatPhoneInput, phoneDigits, validMobile } from '../../lib/quickSend';

const field = 'mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';
const label = 'text-sm font-semibold text-slate-700';
const portalUrl = (token) => `${window.location.origin}/affiliate/${token}`;

function Done({ result, onAnother }) {
  const { affiliate: a, already } = result;
  const first = String(a.name || '').split(' ')[0] || 'them';
  const url = portalUrl(a.portal_token);
  const sms = `sms:+1${a.phone}?&body=${encodeURIComponent(buildText('partnerWelcome', { name: a.name, portalLink: url }))}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } };
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700"><Check className="h-6 w-6" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-xl font-extrabold leading-tight tracking-tight text-slate-900">{already ? `${first} Is Already an Affiliate` : `${first} Is Signed Up`}</p>
            <p className="mt-0.5 text-sm tabular-nums text-slate-500">{formatPhoneInput(a.phone)}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          <T k="qs.aff.next">Text them their Affiliate Portal. They open it from the text, sign the W-9 (about 30 seconds), and save it to their Home Screen.</T>
        </p>
        <a href={sms} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-base font-bold text-white shadow-sm active:bg-blue-800">
          <MessageSquare className="h-5 w-5" aria-hidden="true" /> <T k="qs.aff.text">Text Their Affiliate Portal</T>
        </a>
        <div className="mt-4 flex justify-center text-sm font-semibold text-blue-700">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 py-1">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? <T k="pages.quicksendpage.8e3df4">{'Copied'}</T> : <T k="qs.aff.copy">Copy Portal Link</T>}
          </button>
        </div>
      </div>
      <button type="button" onClick={onAnother} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-bold text-blue-700 shadow-sm active:bg-slate-50"><T k="qs.aff.another">Sign Up Another</T></button>
    </>
  );
}

export default function QuickAffiliate({ signUp }) {
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const firstInput = useRef(null);
  const set = (k) => (e) => setF(v => ({ ...v, [k]: k === 'phone' ? formatPhoneInput(e.target.value) : e.target.value }));
  const ok = f.first.trim() && validMobile(f.phone);
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true); setError('');
    try { setResult(await signUp({ first_name: f.first.trim(), last_name: f.last.trim(), phone: phoneDigits(f.phone), email: f.email.trim() })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  if (result) {
    return <div className="space-y-6"><Done result={result} onAnother={() => { setResult(null); setF({ first: '', last: '', phone: '', email: '' }); setTimeout(() => firstInput.current?.focus(), 0); }} /></div>;
  }
  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Sign up an affiliate">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"><T k="qs.aff.eyebrow">Sign Up an Affiliate</T></p>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-700"><T k="qs.aff.why">They get their own Affiliate Portal and a link to share. Paid per household, after their W‑9.</T></p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="block"><span className={label}><T k="qs.aff.first">First Name</T></span>
          <input ref={firstInput} className={field} autoComplete="off" autoCapitalize="words" maxLength={60} value={f.first} onChange={set('first')} />
        </label>
        <label className="block"><span className={label}><T k="qs.aff.last">Last Name</T></span>
          <input className={field} autoComplete="off" autoCapitalize="words" maxLength={60} value={f.last} onChange={set('last')} />
        </label>
      </div>
      <label className="mt-4 block"><span className={label}><T k="pages.quicksendpage.5968ac">Mobile Number</T></span>
        <input className={field} type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={set('phone')} placeholder="(404) 555-1212" />
      </label>
      <label className="mt-4 block"><span className={label}><T k="qs.aff.email">Email</T> <span className="font-normal text-slate-400"><T k="qs.aff.optional">(optional)</T></span></span>
        <input className={field} type="email" inputMode="email" autoComplete="off" maxLength={160} value={f.email} onChange={set('email')} />
      </label>
      {error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={!ok || busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white shadow-sm active:bg-blue-800 disabled:bg-slate-300 disabled:shadow-none">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <UserPlus className="h-5 w-5" aria-hidden="true" />}
        <T k="qs.aff.submit">Sign Them Up</T>
      </button>
    </form>
  );
}
