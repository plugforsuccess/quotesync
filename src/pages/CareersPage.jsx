// src/pages/CareersPage.jsx
// /careers: the jobs at Cam Wiley Agency. Each role says what you'd do, what it takes and
// (when set) what it pays; Apply sends people to the job post (Indeed). A role without a
// post yet says so instead of showing a dead button. All wording is editable with the
// pencil. Reached from the footer (not the top menu). Same look as the consumer site. No black.
import { ArrowRight, BadgeDollarSign, Briefcase, CalendarCheck, Check, GraduationCap, Headphones, LineChart, Palmtree, PiggyBank } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';

const GOLD = '#F5D061';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const wrap = 'mx-auto max-w-6xl px-4 lg:px-8';

// The roles. `apply`: the job post's link (Indeed); empty until it's posted.
// `pay`: shown when set.
const ROLES = [
  {
    key: 'producer', Icon: LineChart, title: 'Licensed Sales Producer',
    pay: '$48,000–$90,000 a year · base plus commission, based on production',
    blurb: 'Help people find out if they’re paying too much. You’ll work our Rate Check inbox, call people who asked for a quote, and help them switch to Allstate.',
    needs: ['A current Georgia Property & Casualty license', 'Comfortable on the phone and talking with people', 'Organized, with steady follow-up'],
    apply: '',
  },
  {
    key: 'csr', Icon: Headphones, title: 'Customer Service Representative',
    pay: '$36,000–$54,000 a year',
    blurb: 'Take care of our customers after they buy: renewals, billing questions and policy changes, so they stay with us for years.',
    needs: ['A current Georgia Property & Casualty license', 'Friendly, patient and detail-oriented', 'Good with computers and follow-up'],
    apply: '',
  },
];

const BENEFITS = [
  [Briefcase, 'W-2 Job with a Base Salary', 'A steady salary plus commission, not a 1099 commission-only gig.'],
  [PiggyBank, '401(k) with a 4% Match', 'We match what you put in, up to 4% of your pay.'],
  [CalendarCheck, 'Paid Every Two Weeks', 'A steady biweekly paycheck.'],
  [Palmtree, 'Paid Time Off', 'Time away that’s paid, to rest and recharge.'],
  [GraduationCap, 'Continuing Education', 'Support for the courses that keep your license current and grow your skills.'],
];

const WHY = [
  'A local agency where your work is seen.',
  'Quotes start with a real request: people send us their policy and ask.',
  'Our own tools handle the busywork, so you can focus on people.',
];

function Role({ r }) {
  const { Icon } = r;
  return (
    <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8" aria-labelledby={`role-${r.key}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100" aria-hidden="true"><Icon className="h-6 w-6" /></span>
      <h3 id={`role-${r.key}`} className="mt-4 text-2xl font-extrabold text-[#0F2D6B]"><T k={`careers.${r.key}.title`}>{r.title}</T></h3>
      {r.pay && (
        <p className="mt-2 flex items-start gap-2 text-[15px] font-semibold text-[#0F2D6B]">
          <BadgeDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" /><span><T k={`careers.${r.key}.pay`}>{r.pay}</T></span>
        </p>
      )}
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600"><T k={`careers.${r.key}.blurb`}>{r.blurb}</T></p>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><T k="careers.needs">What It Takes</T></p>
      <ul className="mt-2 space-y-2">
        {r.needs.map((n, i) => (
          <li key={n} className="flex gap-2.5 text-[15px] text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" strokeWidth={3} aria-hidden="true" /><span><T k={`careers.${r.key}.need${i + 1}`}>{n}</T></span></li>
        ))}
      </ul>
      <div className="mt-auto pt-6">
        {r.apply ? (
          <a href={r.apply} target="_blank" rel="noreferrer" className="qb qb-blue qb-lg w-full"><T k="careers.apply">Apply on Indeed</T> <ArrowRight className="h-5 w-5" aria-hidden="true" /></a>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600"><T k="careers.soon">The job post is coming soon. Check back shortly.</T></p>
        )}
      </div>
    </article>
  );
}

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-white">
      <title>Careers | Cam Wiley Agency</title>
      <section className="text-white" style={{ background: HERO_BG }}>
        <div className={wrap}>
          <ConsumerNav current="careers" />
          <div className="pb-12 pt-8 lg:pb-20 lg:pt-14">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}><T k="careers.eyebrow">Careers at Cam Wiley Agency</T></p>
            <h1 className="mt-3 max-w-3xl text-[36px] font-extrabold leading-[1.08] tracking-tight lg:text-[52px]"><T k="careers.title">Build a Career Helping Georgia Families</T></h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-blue-100 lg:text-lg"><T k="careers.body">We’re a local Allstate agency in Conyers. We help people check what they pay, quote them fast, and take care of them after they buy. We’re hiring people who like helping people and want to grow.</T></p>
            <a href="#roles" className="qb qb-gold qb-lg mt-7 px-7"><T k="careers.see">See Open Roles</T> <ArrowRight className="h-5 w-5" aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section id="roles" className="scroll-mt-4 bg-slate-50 py-14 lg:py-20" aria-labelledby="careers-roles">
        <div className={wrap}>
          <h2 id="careers-roles" className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F2D6B] lg:text-[36px]"><T k="careers.roles">Open Roles</T></h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {ROLES.map(r => <Role key={r.key} r={r} />)}
          </div>
        </div>
      </section>

      <section className="bg-white pt-14 lg:pt-20" aria-labelledby="careers-benefits">
        <div className={wrap}>
          <h2 id="careers-benefits" className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F2D6B] lg:text-[36px]"><T k="careers.benefits">Benefits</T></h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map(([Icon, title, line], i) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-slate-200 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                <div>
                  <p className="text-lg font-extrabold text-[#0F2D6B]"><T k={`careers.benefit${i + 1}`}>{title}</T></p>
                  <p className="mt-0.5 text-[15px] leading-relaxed text-slate-600"><T k={`careers.benefit${i + 1}.line`}>{line}</T></p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white py-14 lg:py-20" aria-labelledby="careers-why">
        <div className={wrap}>
          <h2 id="careers-why" className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0F2D6B] lg:text-[36px]"><T k="careers.why">Why Work Here</T></h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {WHY.map((w, i) => (
              <li key={w} className="rounded-2xl border border-slate-200 p-5 text-[15px] leading-relaxed text-slate-700"><T k={`careers.why${i + 1}`}>{w}</T></li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-slate-500"><T k="careers.eeo">Cam Wiley Agency, Inc. is an equal opportunity employer.</T></p>
        </div>
      </section>
      <RateCheckFooter wide />
    </div>
  );
}
