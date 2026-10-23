// src/pages/PartnerPortalPage.jsx
// Partner portal (/partner/TOKEN), opened from the private link the agency sends a
// partner. First visit: read and sign the partner agreement — their share link
// doesn't pay until they do. After that: their share link, how pay works, and what
// they've earned each month (first names and what each household sent only).
// Standalone like the Rate Check page: no login, no site layout.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Check, Copy, Loader2, Share2 } from 'lucide-react';
import { loadPartnerPortal, signPartnerAgreement, savePartnerPhoto, removePartnerPhoto, squarePhoto, submitPartnerW9 } from '../lib/rateCheckApi';
import { TAX_CLASSES, LLC_CLASSES, formatTin, w9Problems, w9Payload } from './components/rate-checks/w9';
import { inviteUrl } from './components/rate-checks/invite';

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
// A different hello each visit.
const GREETINGS = [
  (n) => `Hi, ${n}`, (n) => `Hey, ${n}`, (n) => `Hello, ${n}`,
  (n) => `Hey there, ${n}`, (n) => `Good to see you, ${n}`, (n) => `What’s good, ${n}`,
];
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 pt-5">
        <span className="text-sm font-extrabold tracking-tight text-slate-900">insuredbycam <span className="font-semibold text-slate-400">· Partner</span></span>
      </header>
      <main className="mx-auto max-w-md px-4 pt-6 pb-12">
        {error ? <p className="rounded-xl bg-white p-4 text-slate-700 ring-1 ring-slate-200">{error}</p>
          : !data ? <p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>
          : !data.agreement.signed ? <SignAgreement token={token} data={data} greet={greet} onSigned={load} />
          : <Earnings token={token} data={data} greet={greet} onChange={load} />}
      </main>
    </div>
  );
}

function SignAgreement({ token, data, greet, onSigned }) {
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
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{greet(data.first_name)} — sign to turn on your link</h1>
      <p className="mt-2 text-slate-600">
        Read the agreement with {data.agency_name}. Your link starts earning as soon as you sign.
      </p>
      {!data.active && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">This partner link is paused. Contact {data.agency_name}.</p>}

      <div className="mt-5 max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200"
        tabIndex={0} aria-label="Partner agreement">{data.agreement.text}</div>

      <label htmlFor="pp-name" className="mt-5 block text-sm font-semibold text-slate-800">Your full legal name</label>
      <input id="pp-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name"
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100" />
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
const INPUT = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';
const CERT = [
  'The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me);',
  'I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the IRS that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding;',
  'I am a U.S. citizen or other U.S. person; and',
  'The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.',
];

function W9Section({ token, data, onChange }) {
  const w9 = data.w9 || {};
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    name: data.name || '', business_name: '', tax_class: 'individual', llc_class: '', other_text: '',
    address: '', city_state_zip: '', tin_type: 'ssn', tin: '', signed_name: data.name || '', accept: false,
  }));
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

  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200" noValidate>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{w9.on_file ? 'Update your W-9' : 'W-9 · needed before your first payment'}</p>
      <p className="mt-1 text-sm text-slate-600">
        This fills IRS Form W-9 for you. Your tax ID is sent once, kept only in the finished form, and never shown here again.
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
            <span><span className="block font-semibold text-slate-900">{t.label}</span>{t.hint && <span className="block text-xs text-slate-500">{t.hint}</span>}</span>
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
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="mt-4 flex gap-2">
        {w9.on_file && <button type="button" onClick={() => setOpen(false)} className="h-14 flex-1 rounded-xl border border-slate-300 font-semibold text-slate-700">Cancel</button>}
        <button type="submit" disabled={busy} className="h-14 flex-1 rounded-xl bg-blue-700 text-lg font-bold text-white disabled:bg-slate-300">{busy ? 'Sending…' : 'Sign W-9'}</button>
      </div>
    </form>
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

function Earnings({ token, data, greet, onChange }) {
  const url = inviteUrl(data.code);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* old browser */ }
  };
  const share = () => navigator.share?.({ title: 'Rate Check', text: 'See if you’re overpaying for insurance (I get a referral fee):', url }).catch(() => {});
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const months = data.months?.length ? data.months : [{ month: thisMonth, households: 0, earned: 0, rows: [], paid: null }];
  const current = months.find(m => m.month === thisMonth) || { month: thisMonth, households: 0, earned: 0, rows: [], paid: null };
  const lifetime = months.reduce((t, m) => t + m.earned, 0);

  return (
    <>
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{greet(data.first_name)}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> Agreement signed {new Date(data.agreement.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <section className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Your link</p>
        <p className="mt-1 truncate font-mono text-sm text-blue-800">{url}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={copy} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800">
            {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" /> Copy link</>}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" onClick={share} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 font-semibold text-white">
              <Share2 className="h-4 w-4" aria-hidden="true" /> Share
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">When you post or message your link, say you get a referral fee. Don&apos;t talk about coverage or prices — just share the link.</p>
      </section>

      <W9Section token={token} data={data} onChange={onChange} />

      <PhotoSection token={token} name={data.first_name} photoUrl={data.photo_url} onChange={onChange} />

      <section className="mt-4 grid grid-cols-3 gap-2">
        {[[monthLabel(current.month).split(' ')[0], current.households, 'households'], ['Earned', money(current.earned), 'this month'], ['All time', money(lifetime), 'earned']].map(([k, v, sub]) => (
          <div key={k} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{k}</p>
            <p className="text-xl font-extrabold tabular-nums text-slate-900">{v}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </section>
      {data.monthly_cap && <p className="mt-2 text-xs text-slate-500">Up to {data.monthly_cap} households are paid each month.</p>}

      {months.map(m => (
        <section key={m.month} className="mt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-slate-900">{monthLabel(m.month)}</h2>
            <span className={`text-sm font-semibold ${m.paid ? 'text-emerald-700' : 'text-slate-500'}`}>
              {m.paid ? `Paid ${money(m.paid.amount)}` : m.earned > 0 ? `${money(m.earned)} · not paid yet` : ''}
            </span>
          </div>
          {m.rows.length ? (
            <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              {m.rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{r.first_name}</span>
                    <span className="block text-xs text-slate-500">{r.label}{r.over_cap ? ' · over this month’s limit' : ''}</span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${r.fee ? 'text-slate-900' : 'text-slate-400'}`}>{money(r.fee)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-slate-500">No households yet this month.</p>}
        </section>
      ))}

      <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">How you&apos;re paid · per household</h2>
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          {SCHEDULE_ROWS.map(([k, label]) => (
            <div key={k} className="flex justify-between py-2"><dt className="text-slate-700">{label}</dt><dd className="font-bold tabular-nums text-slate-900">{money(data.schedule[k])}</dd></div>
          ))}
          <div className="flex justify-between py-2"><dt className="text-slate-700">Each extra line, up to 2</dt><dd className="font-bold tabular-nums text-slate-900">+{money(data.schedule.extra_line)}</dd></div>
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Paid the same whether or not they buy. A household is one phone number, address or policy, paid once, after we&apos;ve quoted it (or 7 days after their first page). Pages that can&apos;t be read, repeats, expired pages and Allstate policies don&apos;t count. Paid monthly after your W-9 is on file; months under $50 carry over.</p>
      </section>
    </>
  );
}
