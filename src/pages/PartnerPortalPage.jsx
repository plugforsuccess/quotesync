// src/pages/PartnerPortalPage.jsx
// Partner portal (/partner/TOKEN), opened from the private link the agency sends a
// partner. First visit: read and sign the partner agreement — their share link
// doesn't pay until they do. After that: their share link, how pay works, and what
// they've earned each month (first names and what each household sent only).
// Standalone like the Rate Check page: no login, no site layout.

import { T } from '../components/SiteCopy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Check, Copy, ExternalLink, FileSignature, Loader2, Share2, Star, X } from 'lucide-react';
import PhotoCropModal from '../components/affiliates/PhotoCropModal';
import HomeScreenSteps from '../components/affiliates/HomeScreenSteps';
import { setHomeScreenName } from '../lib/homeScreenName';
import { reviewUrl } from '../lib/reviews';
import BrandLogo from '../components/BrandLogo';
import { loadPartnerPortal, signPartnerAgreement, savePartnerPhoto, removePartnerPhoto, submitPartnerW9, acceptPartnerTerms } from '../lib/rateCheckApi';
import { AFFILIATE_TERMS_PATH, AFFILIATE_TERMS_VERSION } from '../lib/affiliates';
import { TAX_CLASSES, LLC_CLASSES, formatTin, splitCsz, w9Problems, w9Payload } from './components/rate-checks/w9';
import { inviteUrl } from './components/rate-checks/invite';

const ACCENT = '#39FF88';
// Gold, not green, for text: the platform has no green text (green stays for buttons and fills).
const GOLD = '#F5D061';
const DEEP = '#0F2D6B';
// The link unlocks once the affiliate has signed the W-9. The photo is optional, after.
const isReady = (data) => !!data?.w9?.on_file;
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const longDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
// "Cam Wiley Agency, Inc." + "." without doubling the period.
const sentence = (name) => `${String(name || 'the agency').replace(/\.+$/, '')}.`;
// Money that was paid, always with cents: "$30.00".
const dollars2 = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
// A different hello each visit.
const GREETINGS = [
  (n) => `Hi, ${n}`, (n) => `Hey, ${n}`, (n) => `Hello, ${n}`,
  (n) => `Hey there, ${n}`, (n) => `Good to see you, ${n}`, (n) => `What’s good, ${n}`,
];
// The pay per household (also public on /affiliates). Set to false to hide it again.
const SHOW_PAY_SCHEDULE = true;
const SCHEDULE_ROWS = [
  ['auto_home', 'Auto + home or condo'], ['auto_renters', 'Auto + renters'], ['home_only', 'Home or condo only'],
  ['auto_only', 'Auto only'], ['renters_only', 'Renters only'], ['landlord', 'Landlord'],
];

// Product names capitalized: "Auto + home or condo" → "Auto + Home or Condo".
const productCase = (s) => String(s || '').replace(/\b(auto|home|condo|renters|umbrella|only|extra)\b/g, w => w[0].toUpperCase() + w.slice(1));
// Dates in the agency's time zone (Georgia), the same as the payouts.
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export default function PartnerPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [greet] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const load = useCallback(() => {
    setError('');
    loadPartnerPortal(token).then(setData).catch(err => setError(err.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);
  // Saved to a Home Screen from here, the icon is "Affiliate Portal".
  useEffect(() => setHomeScreenName('Affiliate Portal'), []);

  const gate = data && data.agreement.required && !data.agreement.signed;
  return (
    <div className="min-h-screen bg-slate-50">
      <div style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-md px-4 pt-5 pb-20">
          <header className="flex items-center justify-between">
            <BrandLogo />
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"><T k="pages.partnerportalpage.c82950">Affiliate Portal</T></span>
          </header>
          {data && (
            <>
              <h1 className="mt-7 text-[28px] font-extrabold leading-tight tracking-tight text-white">
                {greet(data.first_name)}{gate && <> <T k="pages.partnerportalpage.ac7625">— Sign to Turn on Your Link</T></>}
              </h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-blue-100">
                {gate ? <><T k="pages.partnerportalpage.a689c7">Read the agreement with</T> {sentence(data.agency_name)} <T k="pages.partnerportalpage.8c18b8">Your link starts earning as soon as you sign.</T></>
                  : data.agreement.signed ? <><Check className="h-4 w-4" style={{ color: GOLD }} aria-hidden="true" /> <T k="pages.partnerportalpage.01210e">Agreement signed</T> {longDate(data.agreement.signed_at)}</>
                  : data.active === false ? <><span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" /> <T k="pages.partnerportalpage.a823cb">Your link is paused. Contact</T> {data.agency_name} <T k="pages.partnerportalpage.6e1fe7">to turn it back on.</T></>
                  : !isReady(data) ? <><span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" /> <T k="aff.portal.header-locked">One quick step to unlock your link</T></>
                  : <><span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" /> <T k="pages.partnerportalpage.95cda3">Your link is live</T></>}
              </p>
            </>
          )}
        </div>
      </div>
      <main className="mx-auto -mt-12 max-w-md px-4 pb-12">
        {error ? <p className="rounded-2xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">{error}</p>
          : !data ? <p className="flex items-center gap-2 rounded-2xl bg-white p-4 text-slate-500 shadow-sm ring-1 ring-slate-200"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> <T k="pages.partnerportalpage.5f02f0">Loading…</T></p>
          : gate ? <SignAgreement token={token} data={data} onSigned={load} />
          : <><Earnings token={token} data={data} onChange={load} />{isReady(data) && <ReviewCard />}</>}
      </main>
    </div>
  );
}

// Partners who are also customers can review their own experience. Optional, no
// reward, and they're asked to say they're a partner (the FTC expects that).
function ReviewCard() {
  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5 text-[#F5D061]" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Star key={i} className="h-4 w-4 fill-current" />)}</span>
        <p className="font-bold text-[#0F2D6B]"><T k="pages.partnerportalpage.219dc3">Also a customer?</T></p>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        <T k="pages.partnerportalpage.e7f45f">An honest Google review about your experience helps other families find Cam. Please mention you’re an affiliate. It’s optional and has nothing to do with your referral fees.</T>
      </p>
      <a href={reviewUrl()} target="_blank" rel="noreferrer" className="qb qb-outline qb-md mt-3 w-full">
        <T k="pages.partnerportalpage.f82b9a">Write a Google Review</T> <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
    </section>
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
      {!data.active && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200"><T k="pages.partnerportalpage.e8ca8f">This affiliate link is paused. Contact</T> {sentence(data.agency_name)}</p>}

      <div className="max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200"
        tabIndex={0} aria-label="Affiliate agreement">{data.agreement.text}</div>

      <label htmlFor="pp-name" className="mt-5 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.93ffd0">Your Full Legal Name</T></label>
      <input id="pp-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name"
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-[#0F2D6B] focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100" />
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
        <span data-copy="fixed">I have read this agreement and agree to it. Typing my name above is my signature.</span>
      </label>
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <button type="button" onClick={sign} disabled={!ok || busy}
        className="qb qb-blue qb-lg mt-5 w-full text-lg">
        {busy ? <T k="pages.partnerportalpage.02d94a">{'Signing…'}</T> : <T k="pages.partnerportalpage.bd1c4d">{'Sign and Turn on My Link'}</T>}
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
    address: w9.prefill?.address || '', ...splitCsz(w9.prefill?.city_state_zip),
    tin_type: 'ssn', tin: '', signed_name: data.name || '', accept: false,
  }));
  const prefilled = !!(data.name && w9.prefill?.address && w9.prefill?.city_state_zip);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm(f => {
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'state') v = v.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
    if (k === 'zip') v = v.replace(/[^\d-]/g, '').slice(0, 10);
    return { ...f, [k]: v };
  });
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
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.b6f43a">W-9 on file</T></span>
          <T k="pages.partnerportalpage.71fed0">Signed</T> {new Date(w9.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="min-h-[40px] shrink-0 text-sm font-semibold text-blue-700"><T k="pages.partnerportalpage.069330">Update</T></button>
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
          ? <><T k="pages.partnerportalpage.c6b656">Your name and address are already filled in. Check them, add your Social Security number, and sign.</T>{' '}</>
          : <><T k="pages.partnerportalpage.ca5250">This fills IRS Form W-9 for you.</T>{' '}</>}
        <T k="pages.partnerportalpage.110235">Your tax ID is sent once, kept only in the finished form, and never shown here again.</T>
      </p>

      <label htmlFor="w9-name" className="mt-4 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.0b8b78">Name on Your Tax Return</T></label>
      <input id="w9-name" autoComplete="name" value={form.name} onChange={set('name')} className={INPUT} />
      {show('name')}

      <label htmlFor="w9-biz" className="mt-4 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.e806de">Business Name</T> <span className="font-normal text-slate-500"><T k="pages.partnerportalpage.1522ba">(if different)</T></span></label>
      <input id="w9-biz" autoComplete="organization" value={form.business_name} onChange={set('business_name')} className={INPUT} />

      <p className="mt-4 text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.d21979">How you file</T></p>
      <div className="mt-1.5 space-y-1.5">
        {TAX_CLASSES.map(t => (
          <label key={t.value} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${form.tax_class === t.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
            <input type="radio" name="w9-class" value={t.value} checked={form.tax_class === t.value} onChange={set('tax_class')} className="mt-0.5 h-5 w-5 accent-blue-700" />
            <span><span className="block font-semibold text-[#0F2D6B]"><T>{t.label}</T></span>{t.hint && <span className="block text-xs text-slate-500"><T>{t.hint}</T></span>}</span>
          </label>
        ))}
      </div>
      {show('tax_class')}
      {form.tax_class === 'llc' && (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.b378ad">The LLC is taxed as</T></p>
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
          <label htmlFor="w9-other" className="mt-3 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.235de2">What Kind of Entity</T></label>
          <input id="w9-other" value={form.other_text} onChange={set('other_text')} className={INPUT} />
          {show('other_text')}
        </>
      )}

      <label htmlFor="w9-addr" className="mt-4 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.669a90">Street Address</T></label>
      <input id="w9-addr" autoComplete="street-address" value={form.address} onChange={set('address')} placeholder="123 Peachtree St NE, Apt 4" className={INPUT} />
      {show('address')}
      <label htmlFor="w9-city" className="mt-4 block text-sm font-semibold text-slate-800"><T k="w9.city">City</T></label>
      <input id="w9-city" autoComplete="address-level2" value={form.city} onChange={set('city')} placeholder="Atlanta" className={INPUT} />
      {show('city')}
      <div className="mt-4 grid grid-cols-[6rem_1fr] gap-3">
        <div>
          <label htmlFor="w9-state" className="block text-sm font-semibold text-slate-800"><T k="w9.state">State</T></label>
          <input id="w9-state" autoComplete="address-level1" autoCapitalize="characters" maxLength={2} value={form.state} onChange={set('state')} placeholder="GA" className={INPUT} />
        </div>
        <div>
          <label htmlFor="w9-zip" className="block text-sm font-semibold text-slate-800"><T k="w9.zip">ZIP</T></label>
          <input id="w9-zip" autoComplete="postal-code" inputMode="numeric" value={form.zip} onChange={set('zip')} placeholder="30303" className={INPUT} />
        </div>
      </div>
      {show('state')}{show('zip')}

      <p className="mt-4 text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.7af993">Taxpayer identification number</T></p>
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
        <p className="font-semibold text-slate-800" data-copy="fixed">Under penalties of perjury, I certify that:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">{CERT.map((c, i) => <li key={i}>{c}</li>)}</ol>
        <p className="mt-2" data-copy="fixed">The IRS does not require your consent to any provision of this document other than the certifications required to avoid backup withholding.</p>
      </div>
      <label htmlFor="w9-sig" className="mt-4 block text-sm font-semibold text-slate-800"><T k="pages.partnerportalpage.8c0900">Signature</T> <span className="font-normal text-slate-500"><T k="pages.partnerportalpage.0fe140">(type your full name)</T></span></label>
      <input id="w9-sig" value={form.signed_name} onChange={set('signed_name')} className={`${INPUT} italic`} />
      {show('signed_name')}
      <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700">
        <input type="checkbox" checked={form.accept} onChange={set('accept')} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
        <span data-copy="fixed">I certify the statements above are true and that typing my name is my signature on Form W-9.</span>
      </label>
      {show('accept')}
      </div>
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {error && <p className="mb-2 text-sm text-red-600" role="alert">{error}</p>}
        {tried && Object.keys(problems).length > 0 && !error && <p className="mb-2 text-sm text-red-600" role="alert"><T k="pages.partnerportalpage.b64e28">Fix the highlighted fields above.</T></p>}
        <button type="submit" disabled={busy} className="qb qb-blue qb-lg w-full text-lg">{busy ? <T k="pages.partnerportalpage.cf7655">{'Sending…'}</T> : <T k="pages.partnerportalpage.0a1b85">{'Sign W-9'}</T>}</button>
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
          <h2 className="text-lg font-extrabold text-[#0F2D6B]"><T>{title}</T></h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Their photo next to "Javon Yarbrough shared this with you" on their link's landing page.
const PHOTO_INPUT_ID = 'affiliate-photo-input';
function PhotoSection({ token, name, photoUrl, onChange }) {
  const input = useRef(null);
  const [file, setFile] = useState(null); // picked, being cropped
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!/^image\//.test(f.type)) { setError('Choose a photo.'); return; }
    setAgree(false); setFile(f);
  };
  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); setFile(null); setAgree(false); onChange(); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><T k="pages.partnerportalpage.be6684">Your photo</T></p>
      <div className="mt-3 flex items-center gap-4">
        <button type="button" onClick={() => input.current?.click()} aria-label={photoUrl ? 'Choose a different photo' : 'Choose a photo'}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 ring-1 ring-slate-200">
          {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <Camera className="h-7 w-7" aria-hidden="true" />}
        </button>
        <p className="text-sm leading-relaxed text-slate-600">
          {photoUrl
            ? 'People who open your link see your photo next to “' + name + ' shared this with you”'
            : <T k="pages.partnerportalpage.8de505">{'Add a photo so people who open your link know it came from you.'}</T>}
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => input.current?.click()} className="qb qb-outline qb-md flex-1">
          {photoUrl ? <T k="pages.partnerportalpage.6080b4">{'Change Photo'}</T> : <T k="pages.partnerportalpage.64fe2a">{'Add a Photo'}</T>}
        </button>
        {photoUrl && (
          <button type="button" disabled={busy} onClick={() => run(() => removePartnerPhoto(token))} className="qb qb-outline qb-md flex-1 text-slate-600">
            {busy ? <T k="pages.partnerportalpage.579d7e">{'Removing…'}</T> : <T k="pages.partnerportalpage.e96390">{'Remove'}</T>}
          </button>
        )}
      </div>
      {error && !file && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      <input ref={input} id={PHOTO_INPUT_ID} type="file" accept="image/*" className="hidden" onChange={pick} />
      {file && (
        <PhotoCropModal file={file} busy={busy} error={error} canUse={agree}
          onCancel={() => { setFile(null); setAgree(false); setError(''); }}
          onUse={(image) => run(() => savePartnerPhoto(token, image))}>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
            <span><T k="pages.partnerportalpage.e4652c">Show this photo with my name on my link's page. I can take it off any time.</T></span>
          </label>
        </PhotoCropModal>
      )}
    </section>
  );
}

// First visits: sign the W-9 to unlock the link. After that, a photo is suggested, never required.
function GetSetUp({ token, data, onChange }) {
  const [w9Open, setW9Open] = useState(false);
  const agreed = !!data.terms?.accepted;
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    if (agreed) { setW9Open(true); return; }
    if (!agree || busy) return;
    setBusy(true); setError('');
    try { await acceptPartnerTerms(token, AFFILIATE_TERMS_VERSION); onChange(); setW9Open(true); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <section className="rounded-3xl bg-white px-5 py-8 text-center shadow-xl shadow-blue-900/10 ring-1 ring-slate-200">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700"><T k="aff.portal.setup">Get Set Up · Step 1 of 2</T></p>
      <span className="mx-auto mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100" aria-hidden="true">
        <FileSignature className="h-8 w-8" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold text-[#0F2D6B]"><T k="aff.portal.w9-head">Sign Your W-9</T></h2>
      <p className="mt-1 text-sm font-semibold text-slate-500"><T k="aff.portal.w9-time">About 30 seconds</T></p>
      <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-slate-600">
        {data.w9?.prefill?.address ? 'Your name and address are filled in. Add your SSN and sign, and your link unlocks right away.' : 'Sign it and your link unlocks right away. It’s also needed before your first payment.'}
      </p>
      {!agreed && (
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm leading-relaxed text-slate-700">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-700" />
          <span data-copy="fixed">I agree to the <Link to={AFFILIATE_TERMS_PATH} target="_blank" className="font-semibold text-blue-700 underline underline-offset-2">Affiliate Program Terms</Link> and to get texts from Cam Wiley Agency, Inc. about my application and the program. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
        </label>
      )}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <button type="button" onClick={start} disabled={!agreed && (!agree || busy)} className="qb qb-blue qb-lg mt-5 w-full"><T k="pages.partnerportalpage.55e75f">Sign My W-9</T></button>
      {w9Open && <W9Section token={token} data={data} onChange={onChange} open={w9Open} setOpen={setW9Open} />}
    </section>
  );
}

// Know someone who'd be a good affiliate? Their invite link opens /affiliates with this
// affiliate's code; the application records who invited them (credit only, no pay).
function InviteCard({ code, invites }) {
  const url = `${window.location.origin}/affiliates?aff=${encodeURIComponent(code || '')}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* old browser */ } };
  const share = () => navigator.share?.({ title: 'Become an affiliate', text: 'I share free insurance rate checks with Cam Wiley Agency and get paid for it. Apply here:', url }).catch(() => {});
  if (!code) return null;
  const sent = invites?.applied || 0;
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="aff-invite">
      <h2 id="aff-invite" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><T k="aff.invite.eyebrow">Invite Someone to Be an Affiliate</T></h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600"><T k="aff.invite.line">Know someone who’d be good at this? Send them your invite link. They apply in a minute, and we’ll know you sent them.</T></p>
      {sent > 0 && (
        <p className="mt-2 text-sm font-semibold text-[#0F2D6B]">{sent} {sent === 1 ? 'person' : 'people'} applied · {invites?.joined || 0} joined</p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={copy} className="qb qb-outline qb-md flex-1">
          {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.a588b1">Copied</T></> : <><Copy className="h-4 w-4" aria-hidden="true" /> <T k="aff.invite.copy">Copy Invite Link</T></>}
        </button>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" onClick={share} className="qb qb-outline qb-md flex-1"><Share2 className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.5a95a4">Share</T></button>
        )}
      </div>
    </section>
  );
}

// After the W-9: a photo helps people trust the link, but it's their call.
function PhotoNudge() {
  return (
    <section className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 ring-1 ring-slate-200" aria-hidden="true"><Camera className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-[#0F2D6B]"><T k="aff.portal.photo-title">Add Your Photo</T> <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500"><T k="aff.portal.optional">Optional</T></span></p>
        <p className="mt-0.5 text-sm leading-snug text-slate-600"><T k="aff.portal.photo-why">People are more likely to open a link when they see who sent it.</T></p>
      </div>
      <button type="button" onClick={() => document.getElementById(PHOTO_INPUT_ID)?.click()} className="qb qb-outline qb-md shrink-0 px-4"><T k="aff.portal.photo-add">Add</T></button>
    </section>
  );
}

function Earnings({ token, data, onChange }) {
  const url = inviteUrl(data.code);
  const [copied, setCopied] = useState(false);
  const ready = isReady(data);
  // Step 2 (Save to Your Home Screen) shows right after the W-9 until they tap Done or Skip for Now.
  const homeKey = `qs_aff_home_${token.slice(0, 12)}`;
  const [homeDone, setHomeDone] = useState(() => { try { return !!localStorage.getItem(homeKey); } catch { return false; } });
  const finishHome = () => { setHomeDone(true); try { localStorage.setItem(homeKey, '1'); } catch { /* private mode */ } };
  const homeStep = ready && !homeDone;
  // Remember their code on this phone, so their own link page can show how to save it.
  useEffect(() => { try { if (data.code) localStorage.setItem('qs_aff_code', data.code); } catch { /* private mode */ } }, [data.code]);
  // Before the W-9: nothing but step 1.
  if (!ready) return <GetSetUp token={token} data={data} onChange={onChange} />;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* old browser */ }
  };
  const share = () => navigator.share?.({ title: 'Rate Check', text: 'Get a second opinion on your insurance (I get a referral fee):', url }).catch(() => {});
  const thisMonth = todayKey().slice(0, 7);
  const months = data.months?.length ? data.months : [{ month: thisMonth, households: 0, earned: 0, rows: [], paid: null }];
  const current = months.find(m => m.month === thisMonth) || { month: thisMonth, households: 0, earned: 0, rows: [], paid: null };
  // Households not paid yet: ones that qualified (paid on pay day) and ones still waiting.
  const pendingIn = (m) => (m.paid ? 0 : (m.households || 0) + (m.pending || 0));
  const pendingAll = months.reduce((t, m) => t + pendingIn(m), 0);
  const paidAll = months.reduce((t, m) => t + (m.paid ? Number(m.paid.amount) || 0 : 0), 0);

  return (
    <>
      {homeStep && <HomeScreenSteps asStep linkUrl={`${url}?app=1`} onDone={finishHome} />}

      <section className={`${homeStep ? 'mt-4 ' : ''}rounded-2xl p-5 text-white shadow-xl shadow-blue-900/20`} style={{ background: `linear-gradient(135deg, #1E40AF 0%, ${DEEP} 100%)` }}>
        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}><T k="pages.partnerportalpage.250f24">Your link</T></p>
        <p className="mt-1.5 truncate font-mono text-[15px] text-white">{url.replace(/^https?:\/\//, '')}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={copy} className="qb qb-gold qb-md flex-1">
            {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.a588b1">Copied</T></> : <><Copy className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.b75833">Copy Link</T></>}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" onClick={share} className="qb qb-outline-dark qb-md flex-1">
              <Share2 className="h-4 w-4" aria-hidden="true" /> <T k="pages.partnerportalpage.5a95a4">Share</T>
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-blue-100"><T k="pages.partnerportalpage.0d57c3">When you post or message your link, say you get a referral fee. Don't talk about coverage or prices. Just share the link.</T></p>
      </section>

      {!data.photo_url && <PhotoNudge />}

      <section className="mt-4 grid grid-cols-3 gap-2">
        {[[monthLabel(current.month).split(' ')[0], (current.households || 0) + (current.pending || 0), 'households'], ['Pending', pendingAll, pendingAll === 1 ? 'household' : 'households'], ['Paid', dollars2(paidAll), 'all time']].map(([k, v, sub]) => (
          <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{k}</p>
            <p className="text-xl font-extrabold tabular-nums text-[#0F2D6B]">{v}</p>
            <p className="text-xs text-slate-500"><T>{sub}</T></p>
          </div>
        ))}
      </section>

      {/* All referrals in one table: a heading row per month, then name and what they sent. */}
      <section className="mt-5 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <caption className="sr-only"><T k="pages.partnerportalpage.874598">Your referrals by month</T></caption>
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
              <th scope="col" className="w-[40%] px-3 py-2.5"><T k="pages.partnerportalpage.49ee30">Name</T></th>
              <th scope="col" className="px-3 py-2.5"><T k="pages.partnerportalpage.068f80">Products</T></th>
            </tr>
          </thead>
          {months.map(m => (
            <tbody key={m.month}>
              <tr className="border-t border-slate-200 bg-slate-50">
                <th scope="colgroup" colSpan={2} className="px-3 py-2.5 text-left">
                  <span className="font-bold text-[#0F2D6B]">{monthLabel(m.month)}</span>
                </th>
              </tr>
              {m.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-[#0F2D6B]">{r.first_name}{r.last_initial ? ` ${r.last_initial}.` : ''}</td>
                  <td className="px-3 py-2.5 text-slate-600">{productCase(r.label)}{r.over_cap ? <T k="pages.partnerportalpage.53596f">{' · over this month’s limit'}</T> : ''}</td>
                </tr>
              ))}
              {m.paid && (
                <tr className="border-t border-slate-200">
                  <th scope="row" className="px-3 py-2.5 text-left font-bold text-[#0F2D6B]"><T k="pages.partnerportalpage.9cf106">Earnings</T></th>
                  <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums text-emerald-700">{dollars2(m.paid.amount)}</td>
                </tr>
              )}
              {!m.rows.length && !m.pending && (
                <tr className="border-t border-slate-100"><td colSpan={2} className="px-3 py-2.5 text-slate-500"><T k="pages.partnerportalpage.0271ee">No referrals yet this month.</T></td></tr>
              )}
            </tbody>
          ))}
        </table>
      </section>

      {SHOW_PAY_SCHEDULE && <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500"><T k="pages.partnerportalpage.867844">How You're Paid · Per Household</T></h2>
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          {SCHEDULE_ROWS.map(([k, label]) => (
            <div key={k} className="flex justify-between py-2"><dt className="text-slate-700"><T>{productCase(label)}</T></dt><dd className="font-bold tabular-nums text-[#0F2D6B]">{money(data.schedule[k])}</dd></div>
          ))}
          <div className="flex justify-between py-2"><dt className="text-slate-700"><T k="pages.partnerportalpage.c99e34">Each Extra Line, Up To 2</T></dt><dd className="font-bold tabular-nums text-[#0F2D6B]">+{money(data.schedule.extra_line)}</dd></div>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500"><T k="pages.partnerportalpage.b3e79d">Paid the same whether or not they buy. A household is one phone number, address or policy, paid once, after we've quoted it (or 7 days after their first page). Pages that can't be read, repeats, expired pages and Allstate policies don't count. Paid monthly after your W-9 is on file; months under $50 carry over.</T></p>
      </section>}

      <InviteCard code={data.code} invites={data.invites} />

      {data.w9?.on_file && <W9Section token={token} data={data} onChange={onChange} />}

      <PhotoSection token={token} name={data.name || data.first_name} photoUrl={data.photo_url} onChange={onChange} />

      {/* Saving to the Home Screen was step 2; it stays here, folded up, for later. */}
      {!homeStep && <HomeScreenSteps linkUrl={`${url}?app=1`} />}

    </>
  );
}
