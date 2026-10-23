// src/pages/PartnerPortalPage.jsx
// Partner portal (/partner/TOKEN), opened from the private link the agency sends a
// partner. First visit: read and sign the partner agreement — their share link
// doesn't pay until they do. After that: their share link, how pay works, and what
// they've earned each month (first names and what each household sent only).
// Standalone like the Rate Check page: no login, no site layout.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import { loadPartnerPortal, signPartnerAgreement } from '../lib/rateCheckApi';
import { inviteUrl } from './components/rate-checks/invite';

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
// A different hello each visit.
const GREETINGS = [
  (n) => `Hi ${n}`, (n) => `Hey ${n}`, (n) => `Hello ${n}`,
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
          : <Earnings data={data} greet={greet} />}
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

function Earnings({ data, greet }) {
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
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Paid the same whether or not they buy. A household is one phone number, paid once. Pages that can&apos;t be read and repeats don&apos;t count. Paid monthly, after your W-9 is on file.</p>
      </section>
    </>
  );
}
