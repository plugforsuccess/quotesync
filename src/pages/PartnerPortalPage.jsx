// src/pages/PartnerPortalPage.jsx
// Partner portal (/partner/TOKEN), opened from the private link the agency sends a
// partner. First visit: read and sign the partner agreement — their share link
// doesn't pay until they do. After that: their share link, how pay works, and what
// they've earned each month (first names and what each household sent only).
// Standalone like the Rate Check page: no login, no site layout.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Check, Copy, Loader2, Share2, X } from 'lucide-react';
import { loadPartnerPortal, signPartnerAgreement, savePartnerPhoto, removePartnerPhoto, squarePhoto, submitPartnerW9 } from '../lib/rateCheckApi';
import { TAX_CLASSES, LLC_CLASSES, formatTin, w9Problems, w9Payload } from './components/rate-checks/w9';
import { inviteUrl } from './components/rate-checks/invite';

const ACCENT = '#39FF88';
const DEEP = '#0F2D6B';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const longDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
// "Cam Wiley Agency, Inc." + "." without doubling the period.
const sentence = (name) => `${String(name || 'the agency').replace(/\.+$/, '')}.`;
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
// A different hello each visit.
const GREETINGS = [
  (n) => `Hi, ${n}`, (n) => `Hey, ${n}`, (n) => `Hello, ${n}`,
  (n) => `Hey there, ${n}`, (n) => `Good to see you, ${n}`, (n) => `What’s good, ${n}`,
];
// The fee schedule is hidden from partners for now (they still see what each
// household earned them). Set to true to show it again.
const SHOW_PAY_SCHEDULE = false;
const SCHEDULE_ROWS = [
  ['auto_home', 'Auto + home or condo'], ['auto_renters', 'Auto + renters'], ['home_only', 'Home or condo only'],
  ['auto_only', 'Auto only'], ['renters_only', 'Renters only'],
];

export default function PartnerPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [greet] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const load = useCallback(() => {
    setError('');
    loadPartnerPortal(token).then(setData).catch(err => setError(err.message));
  }, [token]);
  useEffect(() => {
    document.title = 'Partner portal | insuredbycam';
    load();
  }, [load]);

  const gate = data && data.agreement.required && !data.agreement.signed;
  return (
    <div className="min-h-screen bg-slate-50">
      <div style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-md px-4 pt-5 pb-20">
          <header className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold tracking-tight text-white">insured<span style={{ color: ACCENT }}>by</span>cam.com</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">Partner portal</span>
          </header>
          {data && (
            <>
              <h1 className="mt-7 text-[28px] font-extrabold leading-tight tracking-tight text-white">
                {greet(data.first_name)}{gate && <> — sign to turn on your link</>}
              </h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-blue-100">
                {gate ? <>Read the agreement with {sentence(data.agency_name)} Your link starts earning as soon as you sign.</>
                  : data.agreement.signed ? <><Check className="h-4 w-4" style={{ color: ACCENT }} aria-hidden="true" /> Agreement signed {longDate(data.agreement.signed_at)}</>
                  : <><span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" /> Your link is live</>}
              </p>
            </>
          )}
        </div>
      </div>
      <main className="mx-auto -mt-12 max-w-md px-4 pb-12">
        {error ? <p className="rounded-2xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">{error}</p>
          : !data ? <p className="flex items-center gap-2 rounded-2xl bg-white p-4 text-slate-500 shadow-sm ring-1 ring-slate-200"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>
          : gate ? <SignAgreement token={token} data={data} onSigned={load} />
          : <Earnings token={token} data={data} onChange={load} />}
      </main>
    </div>
  );
}

function SignAgreement({ token, data, onSigned }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fullName = name.replace(/\s+/g, ' ').trim();
  const ok = agree && fullName.length >= 3 && fullName.includes(' ') && data.active;

  const sign = async () => {
    setBusy(true); setError('');
    try { await signPartnerAgreement(token, fullName); onSigned(); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <>
      {!data.active && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">This partner link is paused. Contact {sentence(data.agency_name)}</p>}

      <div className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200"
        tabIndex={0} aria-label="Partner agreement">{data.agreement.text}</div>

      <label htmlFor="pp-name" className="mt-5 block text-sm font-semibold text-slate-800">Your full legal name</label>
      <input id="pp-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name"
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-[#0F2D6B] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100" />
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
        <span>I have read this agreement and agree to it. Typing my name above is my signature.</span>
      </label>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <button type="button" onClick={sign} disabled={!ok || busy}
        className="mt-5 flex h-14 w-full items-center justify-center rounded-xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm active:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
        {busy ? 'Signing…' : 'Sign and turn on my link'}
      </button>
    </>
  );
}

// IRS Form W-9, needed before the first payment. The function fills the real form
// and keeps the PDF privately; the portal only ever shows the last 4 of the TIN.
const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-[#0F2D6B] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';
const CERT = [
  'The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me);',
  'I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the IRS that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding;',
  'I am a U.S. citizen or other U.S. person; and',
  'The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.',
];

// Opens pre-filled: their legal name, "Individual / sole proprietor", and the mailing
// address the agency entered (or from their last W-9). They add the tax ID and sign.
function W9Section({ token, data, onChange, open: openProp, setOpen: setOpenProp }) {
  const w9 = data.w9 || {};
  const [openOwn, setOpenOwn] = useState(false);
  const open = openProp ?? openOwn;
  const setOpen = setOpenProp ?? setOpenOwn;
  const [form, setForm] = useState(() => ({
    name: data.name || '', business_name: '', tax_class: 'individual', llc_class: '', other_text: '',
    address: w9.prefill?.address || '', city_state_zip: w9.prefill?.city_state_zip || '',
    tin_type: 'ssn', tin: '', signed_name: data.name || '', accept: false,
  }));
  const prefilled = !!(data.name && w9.prefill?.address && w9.prefill?.city_state_zip);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const problems = w9Problems(form);
  const show = (k) => (tried && problems[k] ? <p className="mt-1 text-xs text-red-600">{problems[k]}</p> : null);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length) return;
    setBusy(true); setError('');
    try {
      await submitPartnerW9(w9Payload(token, form));
      setForm(f => ({ ...f, tin: '', accept: false })); // the number is gone from the page the moment it's sent
      setOpen(false);
      onChange();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (!w9.on_file && !open) return null; // the Get set up checklist opens it

  if (w9.on_file && !open) {
    return (
      <section className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> W-9 on file</span>
          {w9.tin_type === 'ein' ? 'EIN' : 'SSN'} ending {w9.last4} · signed {new Date(w9.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="min-h-[40px] shrink-0 text-sm font-semibold text-blue-700">Update</button>
      </section>
    );
  }

  // The form opens as a pop-up: full screen on a phone, a centered window on a computer,
  // with Sign W-9 pinned at the bottom.
  return (
    <W9Modal title={w9.on_file ? 'Update your W-9' : 'Sign your W-9'} onClose={() => !busy && setOpen(false)}>
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
      <p className="text-sm text-slate-600">
        {prefilled && !w9.on_file
          ? <>Your name and address are already filled in. Check them, add your Social Security number, and sign.{' '}</>
          : <>This fills IRS Form W-9 for you.{' '}</>}
        Your tax ID is sent once, kept only in the finished form, and never shown here again.
      </p>

      <label htmlFor="w9-name" className="mt-4 block text-sm font-semibold text-slate-800">Name on your tax return</label>
      <input id="w9-name" autoComplete="name" value={form.name} onChange={set('name')} className={INPUT} />
      {show('name')}

      <label htmlFor="w9-biz" className="mt-4 block text-sm font-semibold text-slate-800">Business name <span className="font-normal text-slate-500">(if different)</span></label>
      <input id="w9-biz" autoComplete="organization" value={form.business_name} onChange={set('business_name')} className={INPUT} />

      <p className="mt-4 text-sm font-semibold text-slate-800">How you file</p>
      <div className="mt-1.5 space-y-1.5">
        {TAX_CLASSES.map(t => (
          <label key={t.value} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${form.tax_class === t.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
            <input type="radio" name="w9-class" value={t.value} checked={form.tax_class === t.value} onChange={set('tax_class')} className="mt-0.5 h-5 w-5 accent-blue-700" />
            <span><span className="block font-semibold text-[#0F2D6B]">{t.label}</span>{t.hint && <span className="block text-xs text-slate-500">{t.hint}</span>}</span>
          </label>
        ))}
      </div>
      {show('tax_class')}
      {form.tax_class === 'llc' && (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-800">The LLC is taxed as</p>
          <div className="mt-1.5 flex gap-2">
            {LLC_CLASSES.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm(f => ({ ...f, llc_class: v }))} aria-pressed={form.llc_class === v}
                className={`min-h-[44px] flex-1 rounded-xl border text-sm font-semibold ${form.llc_class === v ? 'border-blue-600 bg-blue-700 text-white' : 'border-slate-300 text-slate-800'}`}>{l}</button>
            ))}
          </div>
          {show('llc_class')}
        </>
      )}
      {form.tax_class === 'other' && (
        <>
          <label htmlFor="w9-other" className="mt-3 block text-sm font-semibold text-slate-800">What kind of entity</label>
          <input id="w9-other" value={form.other_text} onChange={set('other_text')} className={INPUT} />
          {show('other_text')}
        </>
      )}

      <label htmlFor="w9-addr" className="mt-4 block text-sm font-semibold text-slate-800">Street address</label>
      <input id="w9-addr" autoComplete="street-address" value={form.address} onChange={set('address')} placeholder="123 Peachtree St NE, Apt 4" className={INPUT} />
      {show('address')}
      <label htmlFor="w9-csz" className="mt-4 block text-sm font-semibold text-slate-800">City, state, ZIP</label>
      <input id="w9-csz" value={form.city_state_zip} onChange={set('city_state_zip')} placeholder="Atlanta, GA 30303" className={INPUT} />
      {show('city_state_zip')}

      <p className="mt-4 text-sm font-semibold text-slate-800">Taxpayer identification number</p>
      <div className="mt-1.5 flex gap-2">
        {[['ssn', 'Social Security number'], ['ein', 'Employer ID number']].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setForm(f => ({ ...f, tin_type: v, tin: '' }))} aria-pressed={form.tin_type === v}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-semibold ${form.tin_type === v ? 'border-blue-600 bg-blue-700 text-white' : 'border-slate-300 text-slate-800'}`}>{l}</button>
        ))}
      </div>
      {show('tin_type')}
      <input aria-label={form.tin_type === 'ein' ? 'Employer identification number' : 'Social Security number'} inputMode="numeric" autoComplete="off"
        value={formatTin(form.tin, form.tin_type)} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))}
        placeholder={form.tin_type === 'ein' ? '12-3456789' : '123-45-6789'} className={`${INPUT} font-mono tracking-wider`} />
      {show('tin')}

      <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-800">Under penalties of perjury, I certify that:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">{CERT.map((c, i) => <li key={i}>{c}</li>)}</ol>
        <p className="mt-2">The IRS does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.</p>
      </div>
      <label htmlFor="w9-sig" className="mt-4 block text-sm font-semibold text-slate-800">Signature <span className="font-normal text-slate-500">(type your full name)</span></label>
      <input id="w9-sig" value={form.signed_name} onChange={set('signed_name')} className={`${INPUT} italic`} />
      {show('signed_name')}
      <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={form.accept} onChange={set('accept')} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
        <span>I certify the statements above are true and that typing my name is my signature on Form W-9.</span>
      </label>
      {show('accept')}
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {error && <p className="mb-2 text-sm text-red-600" role="alert">{error}</p>}
        {tried && Object.keys(problems).length > 0 && !error && <p className="mb-2 text-sm text-red-600" role="alert">Fix the highlighted fields above.</p>}
        <button type="submit" disabled={busy} className="h-14 w-full rounded-xl bg-blue-700 text-lg font-bold text-white disabled:bg-slate-300">{busy ? 'Sending…' : 'Sign W-9'}</button>
      </div>
    </form>
    </W9Modal>
  );
}

function W9Modal({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,45,107,0.55)' }} onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-extrabold text-[#0F2D6B]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Their photo next to "Javon shared this with you" on their link's landing page.
function PhotoSection({ token, name, photoUrl, onChange }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try { setPreview(await squarePhoto(file)); } catch (err) { setError(err.message); }
  };
  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); setPreview(null); setAgree(false); onChange(); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const shown = preview || photoUrl;

  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Your photo</p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" onClick={() => input.current?.click()} aria-label={shown ? 'Choose a different photo' : 'Choose a photo'}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 ring-1 ring-slate-200">
          {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : <Camera className="h-7 w-7" aria-hidden="true" />}
        </button>
        <p className="text-sm leading-relaxed text-slate-600">
          {photoUrl && !preview
            ? 'People who open your link see your photo next to “' + name + ' shared this with you.”'
            : 'Add a photo so people who open your link know it came from you.'}
        </p>
      </div>
      {preview ? (
        <>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
            <span>Show this photo with my first name on my link&apos;s page. I can take it off any time.</span>
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setPreview(null); setAgree(false); }} className="h-12 flex-1 rounded-xl border border-slate-300 font-semibold text-slate-700">Cancel</button>
            <button type="button" disabled={!agree || busy} onClick={() => run(() => savePartnerPhoto(token, preview))}
              className="h-12 flex-1 rounded-xl bg-blue-700 font-semibold text-white disabled:bg-slate-300">{busy ? 'Saving…' : 'Use this photo'}</button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => input.current?.click()} className="h-12 flex-1 rounded-xl border border-slate-300 font-semibold text-slate-800">
            {photoUrl ? 'Change photo' : 'Add a photo'}
          </button>
          {photoUrl && (
            <button type="button" disabled={busy} onClick={() => run(() => removePartnerPhoto(token))} className="h-12 flex-1 rounded-xl border border-slate-300 font-semibold text-slate-600">
              {busy ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </section>
  );
}

// First visits: two steps to get paid. Goes away once the W-9 is on file.
function GetSetUp({ token, data, onChange, shared }) {
  const [w9Open, setW9Open] = useState(false);
  const Step = ({ n, done, title, line, children }) => (
    <li className="flex gap-3 py-3 first:pt-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'}`}>
        {done ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${done ? 'text-slate-500 line-through decoration-slate-300' : 'text-[#0F2D6B]'}`}>{title}</p>
        {line && !done && <p className="text-sm leading-relaxed text-slate-600">{line}</p>}
        {children}
      </div>
    </li>
  );
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Get set up · 2 steps</p>
      <ol className="mt-3 divide-y divide-slate-100">
        <Step n={1} done={shared} title="Share your link" line="Copy it below and send it to people you know. Say you get a referral fee." />
        <Step n={2} done={false} title="Sign your W-9 · about 30 seconds"
          line={data.w9?.prefill?.address ? 'Your name and address are filled in. Add your SSN and sign.' : 'Needed before your first payment.'}>
          <button type="button" onClick={() => setW9Open(true)} className="mt-2.5 h-11 w-full rounded-xl bg-blue-700 font-semibold text-white active:bg-blue-800">Sign my W-9</button>
          {w9Open && <W9Section token={token} data={data} onChange={onChange} open={w9Open} setOpen={setW9Open} />}
        </Step>
      </ol>
    </section>
  );
}

function Earnings({ token, data, onChange }) {
  const url = inviteUrl(data.code);
  const [copied, setCopied] = useState(false);
  // "Share your link" in Get set up is done once they've copied or shared it on this device.
  const sharedKey = `qs_partner_shared_${token.slice(0, 12)}`;
  const [shared, setShared] = useState(() => { try { return !!localStorage.getItem(sharedKey); } catch { return false; } });
  const markShared = () => { setShared(true); try { localStorage.setItem(sharedKey, '1'); } catch { /* private mode */ } };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); markShared(); setTimeout(() => setCopied(false), 1800); } catch { /* old browser */ }
  };
  const share = () => navigator.share?.({ title: 'Rate Check', text: 'Get a second opinion on your insurance (I get a referral fee):', url }).then(markShared).catch(() => {});
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const months = data.months?.length ? data.months : [{ month: thisMonth, households: 0, earned: 0, rows: [], paid: null }];
  const current = months.find(m => m.month === thisMonth) || { month: thisMonth, households: 0, earned: 0, rows: [], paid: null };
  const lifetime = months.reduce((t, m) => t + m.earned, 0);

  return (
    <>
      {!data.w9?.on_file && <GetSetUp token={token} data={data} onChange={onChange} shared={shared} />}

      <section className={`${data.w9?.on_file ? '' : 'mt-4 '}rounded-2xl p-5 text-white shadow-xl shadow-blue-900/20`} style={{ background: `linear-gradient(135deg, #1E40AF 0%, ${DEEP} 100%)` }}>
        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>Your link</p>
        <p className="mt-1.5 truncate font-mono text-[15px] text-white">{url.replace(/^https?:\/\//, '')}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={copy} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-bold transition active:brightness-95" style={{ background: ACCENT, color: DEEP }}>
            {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" /> Copy link</>}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" onClick={share} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white/15 font-semibold text-white ring-1 ring-white/25">
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-blue-100">When you post or message your link, say you get a referral fee. Don&apos;t talk about coverage or prices. Just share the link.</p>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2">
        {[[monthLabel(current.month).split(' ')[0], current.households, 'households'], ['Earned', money(current.earned), 'this month'], ['All time', money(lifetime), 'earned']].map(([k, v, sub]) => (
          <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{k}</p>
            <p className="text-xl font-extrabold tabular-nums text-[#0F2D6B]">{v}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </section>
      {data.monthly_cap && <p className="mt-2 text-xs text-slate-500">Up to {data.monthly_cap} households are paid each month.</p>}

      {months.map(m => (
        <section key={m.month} className="mt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-[#0F2D6B]">{monthLabel(m.month)}</h2>
            <span className={`text-sm font-semibold ${m.paid ? 'text-emerald-700' : 'text-slate-500'}`}>
              {m.paid ? `Paid ${money(m.paid.amount)}` : m.earned > 0 ? `${money(m.earned)} · not paid yet` : ''}
            </span>
          </div>
          {m.rows.length ? (
            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              {m.rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#0F2D6B]">{r.first_name}</span>
                    <span className="block text-xs text-slate-500">{r.label}{r.over_cap ? ' · over this month’s limit' : ''}</span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${r.fee ? 'text-[#0F2D6B]' : 'text-slate-400'}`}>{money(r.fee)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No households yet this month.</p>}
        </section>
      ))}

      {data.w9?.on_file && <W9Section token={token} data={data} onChange={onChange} />}

      <PhotoSection token={token} name={data.first_name} photoUrl={data.photo_url} onChange={onChange} />

      {SHOW_PAY_SCHEDULE && <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">How you&apos;re paid · per household</h2>
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          {SCHEDULE_ROWS.map(([k, label]) => (
            <div key={k} className="flex justify-between py-2"><dt className="text-slate-700">{label}</dt><dd className="font-bold tabular-nums text-[#0F2D6B]">{money(data.schedule[k])}</dd></div>
          ))}
          <div className="flex justify-between py-2"><dt className="text-slate-700">Each extra line, up to 2</dt><dd className="font-bold tabular-nums text-[#0F2D6B]">+{money(data.schedule.extra_line)}</dd></div>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Paid the same whether or not they buy. A household is one phone number, address or policy, paid once, after we&apos;ve quoted it (or 7 days after their first page). Pages that can&apos;t be read, repeats, expired pages and Allstate policies don&apos;t count. Paid monthly after your W-9 is on file; months under $50 carry over.</p>
      </section>}
    </>
  );
}
