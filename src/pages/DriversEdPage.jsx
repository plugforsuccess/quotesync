// src/pages/DriversEdPage.jsx
// Drivers Ed (/courses): the Georgia 6-hour defensive driving course and the Joshua's Law
// teen course, plus the referral partner program (aimed at customers taking the course for
// their discount, with an apply form), in the consumer site's look — royal-blue hero with the shared nav, white
// cards, deep-blue headings, the fluorescent green as the accent. No black.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Loader2, Share2, PenLine, BadgeDollarSign } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';

const JOSHUAS_LAW_LINK = 'https://insuredbycam.nationaldrivered.com/dc/100038';
const RETURNING_CUSTOMER_LINK = 'https://insuredbycam.nationaldrivered.com/login?returnUrl=/CourseInfo';

const ACCENT = '#39FF88';
const DEEP = '#0F2D6B';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const wrap = 'mx-auto max-w-6xl px-4 lg:px-8';
const sectionTitle = 'text-[28px] font-extrabold leading-tight tracking-tight text-[#0F2D6B] lg:text-[36px]';

function Ticks({ items }) {
  return (
    <ul className="space-y-2.5">
      {items.map(t => (
        <li key={t} className="flex items-start gap-2.5 text-[15px] text-slate-700">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50">
            <Check className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" strokeWidth={3} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function About({ title, steps, listTitle, list, q, a }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8">
      <h3 className="text-xl font-extrabold text-[#0F2D6B]">{title}</h3>
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-blue-700">How it works</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:font-semibold marker:text-blue-700">
        {steps.map(s => <li key={s}>{s}</li>)}
      </ol>
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-blue-700">{listTitle}</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-blue-300">
        {list.map(s => <li key={s}>{s}</li>)}
      </ul>
      <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-[15px] text-slate-700">
        <span className="font-semibold text-[#0F2D6B]">{q}</span> {a}
      </div>
    </div>
  );
}

const FAQ = [
  ['Can I take both courses?', 'Absolutely! If you’re a parent helping your teen, you can enroll in Defensive Driving for your own insurance discount while your teen completes Joshua’s Law.'],
  ['How long do I have access?', 'Both courses give you extended access to complete at your own pace. You can log in and out as needed, and your progress is automatically saved.'],
  ['Are certificates sent automatically?', 'Joshua’s Law certificates are sent directly to Georgia DDS. Defensive Driving certificates are downloadable for you to submit to your insurer.'],
  ['What if I need help during the course?', 'Both course providers offer customer support via phone and email during extended business hours.'],
];

const PARTNER_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-check-partner`
  : '/functions/v1/rate-check-partner';

const PARTNER_STEPS = [
  ['1', PenLine, 'Apply below', 'It takes a minute. Cam’s team texts you to set you up.'],
  ['2', Share2, 'Share your link', 'Send your personal Rate Check link to people you know.'],
  ['3', BadgeDollarSign, 'Get paid monthly', 'For each household that sends their policy through it.'],
];
const AUDIENCES = ['Friends & family', 'Coworkers', 'My clients (realtor, dealer, lender…)', 'Social media followers', 'Other'];
const phoneDigits = (s) => String(s || '').replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
const formatPhone = (s) => {
  const d = phoneDigits(s);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
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

const input = 'mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-[#0F2D6B] placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';

// The referral partner program: why (you're already taking the course for the discount —
// your friends are probably overpaying too), how, and a short application.
function PartnerProgram() {
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '', allstate: '', agent: '', audience: '' });
  const [state, setState] = useState({ status: 'idle', error: '' });
  const set = (k) => (e) => setF(v => ({ ...v, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value }));
  const ok = f.first.trim() && /^[2-9]\d{2}[2-9]\d{6}$/.test(phoneDigits(f.phone));
  const apply = async (e) => {
    e.preventDefault();
    if (!ok || state.status === 'sending') return;
    setState({ status: 'sending', error: '' });
    try {
      const res = await fetch(PARTNER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '' },
        body: JSON.stringify({ mode: 'apply', first_name: f.first.trim(), last_name: f.last.trim(), phone: phoneDigits(f.phone), email: f.email.trim(), is_customer: f.allstate === 'no' ? 'no' : f.allstate === 'yes' ? (f.agent || 'allstate_unsure') : null, audience: f.audience || null, source: 'drivers_ed' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
      setState({ status: 'done', error: '' });
    } catch (err) {
      setState({ status: 'idle', error: err.message });
    }
  };

  return (
    <section id="partners" className="scroll-mt-4 bg-white py-14 lg:py-20" aria-labelledby="de-partners">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-14`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><T k="de.partner.eyebrow">Referral partner program</T></p>
          <h2 id="de-partners" className={`mt-2 ${sectionTitle}`}><T k="de.partner.heading">Taking the course for your discount? Get paid to share the savings.</T></h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            <T k="de.partner.body">Already with Allstate and saving with the course? The people you know are probably overpaying too. As a Cam Wiley Agency referral partner you share your own Rate Check link, and you’re paid for every household that sends their declarations page through it—whether or not they buy.</T>
          </p>
          <ol className="mt-8 space-y-4">
            {PARTNER_STEPS.map(([n, Icon, title, line]) => (
              <li key={n} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: DEEP, color: ACCENT }}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-extrabold text-[#0F2D6B]"><T k={`de.partner.step${n}.title`}>{title}</T></p>
                  <p className="text-[15px] text-slate-600"><T k={`de.partner.step${n}.line`}>{line}</T></p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-xs leading-relaxed text-slate-500">
            <T k="de.partner.fine">Allstate customers and non-customers are welcome. Partners don’t discuss coverage or prices—Cam’s licensed team handles every quote. Payment follows the partner agreement you sign, and a W-9 is needed before your first payment.</T>
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-7">
          {state.status === 'done' ? (
            <div className="py-6 text-center" role="status">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(57,255,136,0.2)' }}>
                <Check className="h-7 w-7 text-emerald-600" aria-hidden="true" strokeWidth={3} />
              </span>
              <p className="mt-4 text-xl font-extrabold text-[#0F2D6B]">Thanks, {f.first.trim()}!</p>
              <p className="mt-2 text-slate-600"><T k="de.partner.thanks">Cam’s team will text you within one business day with your partner agreement and your personal link.</T></p>
            </div>
          ) : (
            <form onSubmit={apply} noValidate>
              <p className="text-lg font-extrabold text-[#0F2D6B]"><T k="de.partner.formtitle">Apply to be a partner</T></p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold text-slate-700">First name
                  <input className={input} autoComplete="given-name" value={f.first} onChange={set('first')} maxLength={60} required />
                </label>
                <label className="block text-sm font-semibold text-slate-700">Last name
                  <input className={input} autoComplete="family-name" value={f.last} onChange={set('last')} maxLength={60} />
                </label>
              </div>
              <label className="mt-3 block text-sm font-semibold text-slate-700">Mobile number
                <input className={input} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(404) 555-1212" value={f.phone} onChange={set('phone')} required />
              </label>
              <label className="mt-3 block text-sm font-semibold text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span>
                <input className={input} type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} maxLength={160} />
              </label>
              <Choice legend="Are you an Allstate customer?" name="allstate" value={f.allstate}
                options={[['yes', 'Yes'], ['no', 'No']]} onChange={v => setF(x => ({ ...x, allstate: v, agent: v === 'yes' ? x.agent : '' }))} />
              {f.allstate === 'yes' && (
                <Choice legend="Is Cam Wiley Agency your agent?" name="agent" value={f.agent}
                  options={[['agency', 'Yes'], ['allstate_other', 'No'], ['allstate_unsure', 'Not sure']]} onChange={v => setF(x => ({ ...x, agent: v }))} />
              )}
              <label className="mt-4 block text-sm font-semibold text-slate-700">Who would you share it with? <span className="font-normal text-slate-400">(optional)</span>
                <select className={input} value={f.audience} onChange={set('audience')}>
                  <option value="">Choose one</option>
                  {AUDIENCES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              {state.error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
              <button type="submit" disabled={!ok || state.status === 'sending'}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 py-4 text-base font-bold text-white shadow-lg shadow-blue-700/25 hover:bg-blue-800 disabled:bg-slate-300 disabled:shadow-none">
                {state.status === 'sending' && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                <T k="de.partner.button">Apply to be a partner</T>
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">By applying, you agree Cam’s team may call or text you about the partner program.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

export default function GeorgiaDriverEducationPage() {
  return (
    <div className="min-h-screen bg-white">
      <title>Georgia Driver Education &amp; Insurance Discounts | insuredbycam</title>

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 50% at 5% 0%, rgba(96,165,250,0.35), transparent 70%), radial-gradient(45% 45% at 100% 100%, rgba(57,255,136,0.18), transparent 70%)' }} />
        <div className={`relative ${wrap}`}>
          <ConsumerNav current="drivers" />
          <div className="pb-14 pt-8 lg:pb-20 lg:pt-14">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>Driver Education · Georgia</p>
            <h1 className="mt-3 max-w-3xl text-[36px] font-extrabold leading-[1.08] tracking-tight lg:text-[52px]">
              <T k="de.headline">Georgia Driver Education & Insurance Discounts</T>
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-blue-100 lg:text-lg">
              <T k="de.subhead">Complete your driver education online—whether you’re earning your license or looking to save on insurance. Both courses are 100% online and state-approved.</T>
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <a href={RETURNING_CUSTOMER_LINK} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                Already enrolled? Continue your course <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="#partners" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/10" style={{ color: ACCENT }}>
                <T k="de.partner.herolink">Become a referral partner</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* The two courses */}
      <section className="bg-slate-50 py-14 lg:py-20">
        <div className={`${wrap} grid gap-6 lg:grid-cols-2`}>
          <div className="relative flex flex-col rounded-3xl border-2 bg-white p-6 shadow-[0_0_0_4px_rgba(57,255,136,0.18)] lg:p-8" style={{ borderColor: ACCENT }}>
            <span className="absolute right-5 top-5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: ACCENT, color: DEEP }}>Most popular</span>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Insurance discount</p>
            <h2 className="mt-2 pr-28 text-2xl font-extrabold text-[#0F2D6B]">Defensive Driving Course</h2>
            <p className="mt-2 text-[15px] text-slate-600">Save on your insurance premium by completing this 6-hour online defensive driving course. Many Georgia insurers offer recurring discounts.</p>
            <div className="mt-5"><Ticks items={['6-hour online course, complete at your own pace', 'Eligible for insurance discounts with most carriers', 'Downloadable completion certificate', 'Available for all ages 18+']} /></div>
            <p className="mt-6 text-3xl font-extrabold text-[#0F2D6B]">$24.95</p>
            <Link to="/courses/defensive-driving"
              className="mt-4 block rounded-2xl bg-blue-700 py-4 text-center text-base font-bold text-white shadow-lg shadow-blue-700/25 hover:bg-blue-800">
              Start Defensive Driving Course
            </Link>
          </div>

          <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 lg:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Teen drivers (15–17)</p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#0F2D6B]">Joshua’s Law Course</h2>
            <p className="mt-2 text-[15px] text-slate-600">Required for Georgia teens to get their Class D license. Complete the 30-hour course online to fulfill your driver’s ed requirement.</p>
            <div className="mt-5"><Ticks items={['30-hour state-approved curriculum', 'Required for Class D license (ages 15–17)', 'Certificate sent directly to DDS', 'Complete 100% online at your own pace']} /></div>
            <p className="mt-6 text-3xl font-extrabold text-[#0F2D6B]">$29.00</p>
            <a href={JOSHUAS_LAW_LINK} target="_blank" rel="noreferrer"
              className="mt-4 block rounded-2xl border-2 border-blue-700 py-3.5 text-center text-base font-bold text-blue-700 hover:bg-blue-50">
              Start Joshua’s Law Course
            </a>
          </div>
        </div>
      </section>

      <PartnerProgram />

      {/* Details */}
      <section className="bg-white py-14 lg:py-20">
        <div className={`${wrap} grid gap-6 lg:grid-cols-2`}>
          <About title="About Defensive Driving"
            steps={['Check with your insurer to confirm they accept this course', 'Enroll and complete the 6-hour program at your own pace', 'Download your completion certificate', 'Submit certificate to your insurance company', 'Enjoy your premium discount']}
            listTitle="Course features"
            list={['Works on mobile, tablet, or desktop', 'Mix of text, videos, and animations', 'Automatic progress saving', 'Optional audio read-along', '30-day money-back guarantee']}
            q="Will I get a discount?" a="Most Georgia insurers offer defensive driving discounts, but you should always verify with your specific carrier before enrolling." />
          <About title="About Joshua’s Law"
            steps={['Enroll in the 30-hour online course', 'Complete interactive lessons and quizzes', 'Pass the final exam', 'Certificate automatically sent to Georgia DDS', 'You’re ready to schedule your road test']}
            listTitle="Requirements"
            list={['Required for teens ages 15–17 in Georgia', 'Must complete before applying for Class D license', 'No in-person classroom attendance needed', 'Self-paced with 12-month access', '30-day money-back guarantee']}
            q="Is this state-approved?" a="Yes, this course is fully approved by the Georgia Department of Driver Services and satisfies Joshua’s Law requirements." />
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-14 lg:py-20" aria-labelledby="de-faq">
        <div className={wrap}>
          <h2 id="de-faq" className={sectionTitle}>Frequently asked questions</h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            {FAQ.map(([q, a]) => (
              <div key={q} className="rounded-3xl border border-slate-200 bg-white p-6">
                <dt className="font-bold text-[#0F2D6B]">{q}</dt>
                <dd className="mt-2 text-[15px] text-slate-600">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The rate check ask */}
      <section className="relative overflow-hidden py-16 text-center text-white lg:py-20" style={{ background: HERO_BG }}>
        <div className={`relative ${wrap}`}>
          <h2 className="text-[30px] font-extrabold leading-tight tracking-tight lg:text-[40px]">Need an insurance quote?</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-blue-100">Snap your declarations page. Cam checks if Allstate can beat it.</p>
          <Link to="/" className="mx-auto mt-7 inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold shadow-lg shadow-emerald-500/30"
            style={{ background: ACCENT, color: DEEP }}>
            Check my rate <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Disclosure + footer */}
      <div className="border-t border-slate-200 bg-slate-50 pt-8">
        <p className={`${wrap} mb-6 text-[11px] leading-relaxed text-slate-500`}>
          Some programs on this page are partner or affiliate offers. If you enroll through these links, insuredbycam.com may earn a commission at no extra cost to you. Only programs that provide real safety or savings benefits are recommended here. *Pricing shown is approximate and may vary based on active promotions—see partner site for current rates.
        </p>
        <RateCheckFooter wide />
      </div>
    </div>
  );
}
