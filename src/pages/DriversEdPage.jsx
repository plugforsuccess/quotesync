// src/pages/DriversEdPage.jsx
// Drivers Ed (/courses): the Georgia 6-hour defensive driving course and the Joshua's Law
// teen course, in the consumer site's look — royal-blue hero with the shared nav, white
// cards, deep-blue headings, the fluorescent green as the accent. No black.
import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
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
            <a href={RETURNING_CUSTOMER_LINK} target="_blank" rel="noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
              Already enrolled? Continue your course <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
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
