// src/components/affiliates/AffiliateApplyForm.jsx
// The affiliate application (on /affiliates): name, mobile, optional email, whether they're
// with Allstate, and who they'd share with. Sent to rate-check-partner (mode 'apply'); the
// principal reviews it in Rate Checks → Affiliates. A producer's recruit link
// (/affiliates?by=CODE) is remembered for the visit and credits that producer.
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { T } from '../SiteCopy';
import { AFFILIATE_URL, recruitCode } from '../../lib/affiliates';

const AUDIENCES = ['Friends & family', 'Coworkers', 'My clients (realtor, dealer, lender…)', 'Social media followers', 'Other'];
const phoneDigits = (s) => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
const formatPhone = (s) => {
  const d = phoneDigits(s);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
const input = 'mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-[#0F2D6B] placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';

// A row of tap-to-pick answers (radio buttons styled as buttons).
function Choice({ legend, name, value, options, onChange }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold text-slate-700">{legend}</legend>
      <div className={`mt-1.5 grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map(([v, l]) => (
          <label key={v} className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold ${value === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700'}`}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" /> {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AffiliateApplyForm() {
  const [recruit] = useState(recruitCode);
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '', allstate: '', agent: '', audience: '' });
  const [state, setState] = useState({ status: 'idle', error: '' });
  const set = (k) => (e) => setF(v => ({ ...v, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value }));
  const ok = f.first.trim() && /^[2-9]\d{2}[2-9]\d{6}$/.test(phoneDigits(f.phone));
  const apply = async (e) => {
    e.preventDefault();
    if (!ok || state.status === 'sending') return;
    setState({ status: 'sending', error: '' });
    try {
      const res = await fetch(AFFILIATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
        body: JSON.stringify({
          mode: 'apply', first_name: f.first.trim(), last_name: f.last.trim(), phone: phoneDigits(f.phone), email: f.email.trim(),
          is_customer: f.allstate === 'no' ? 'no' : f.allstate === 'yes' ? (f.agent || 'allstate_unsure') : null,
          audience: f.audience || null, source: recruit ? 'recruit_link' : 'affiliates_page', recruit_code: recruit || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      setState({ status: 'done', error: '' });
    } catch (err) {
      setState({ status: 'idle', error: err.message });
    }
  };

  if (state.status === 'done') {
    return (
      <div className="py-6 text-center" role="status">
        <span className="qc-badge" aria-hidden="true"><Check className="h-8 w-8" strokeWidth={3} /></span>
        <p className="mt-4 text-xl font-extrabold text-[#0F2D6B]"><T k="pages.driversedpage.86c345">Thanks,</T> {f.first.trim()}!</p>
        <p className="mt-2 text-slate-600"><T k="de.partner.thanks">Cam’s team will text you within one business day with your affiliate agreement and your personal link.</T></p>
      </div>
    );
  }
  return (
    <form onSubmit={apply} noValidate aria-label="Affiliate application">
      <p className="text-lg font-extrabold text-[#0F2D6B]"><T k="de.partner.formtitle">Apply to Be an Affiliate</T></p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold text-slate-700"><T k="pages.driversedpage.20db0b">First Name</T>
          <input className={input} autoComplete="given-name" value={f.first} onChange={set('first')} maxLength={60} required />
        </label>
        <label className="block text-sm font-semibold text-slate-700"><T k="pages.driversedpage.8d3f5e">Last Name</T>
          <input className={input} autoComplete="family-name" value={f.last} onChange={set('last')} maxLength={60} />
        </label>
      </div>
      <label className="mt-3 block text-sm font-semibold text-slate-700"><T k="pages.driversedpage.d14571">Mobile Number</T>
        <input className={input} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(404) 555-1212" value={f.phone} onChange={set('phone')} required />
      </label>
      <label className="mt-3 block text-sm font-semibold text-slate-700"><T k="pages.driversedpage.ce8ae9">Email</T> <span className="font-normal text-slate-400"><T k="pages.driversedpage.f53d1c">(optional)</T></span>
        <input className={input} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} maxLength={160} />
      </label>
      <Choice legend="Are you an Allstate customer?" name="allstate" value={f.allstate}
        options={[['yes', 'Yes'], ['no', 'No']]} onChange={v => setF(x => ({ ...x, allstate: v, agent: v === 'yes' ? x.agent : '' }))} />
      {f.allstate === 'yes' && (
        <Choice legend="Is Cam Wiley your agent?" name="agent" value={f.agent}
          options={[['agency', 'Yes'], ['allstate_other', 'No'], ['allstate_unsure', 'Not sure']]} onChange={v => setF(x => ({ ...x, agent: v }))} />
      )}
      <label className="mt-4 block text-sm font-semibold text-slate-700"><T k="pages.driversedpage.4d20d1">Who Would You Share It With?</T> <span className="font-normal text-slate-400"><T k="pages.driversedpage.f53d1c">(optional)</T></span>
        <select className={input} value={f.audience} onChange={set('audience')}>
          <option value="">Choose one</option>
          {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
      {state.error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={!ok || state.status === 'sending'} className="qb qb-blue qb-lg mt-5 w-full">
        {state.status === 'sending' && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        <T k="de.partner.button">Apply to Be an Affiliate</T>
      </button>
      <p data-copy="fixed" className="mt-3 text-center text-xs text-slate-500">By applying, you agree we may call or text you about the affiliate program.</p>
    </form>
  );
}
