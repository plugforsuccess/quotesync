// src/pages/DriversEdPage.jsx
// Drivers Ed (/courses): the Georgia 6-hour defensive driving course (and the Joshua's Law
// teen course, hidden for now: SHOW_JOSHUAS_LAW), plus a short teaser for the affiliate
// program (its own page, /affiliates), in the consumer site's look — royal-blue hero with the shared nav, white
// cards, deep-blue headings, the fluorescent green as the accent. No black.
import { useEffect } from 'react';
import { rateCheckStart } from '../lib/rateCheckStart';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';

const JOSHUAS_LAW_LINK = 'https://insuredbycam.nationaldrivered.com/dc/100038';
// Joshua's Law (the teen course) is hidden for now, not deleted: true brings back its
// card, its About panel and the FAQ answers that mention it.
const SHOW_JOSHUAS_LAW = false;
// Hidden: the outside course site's sign-in (Already Enrolled now opens our course portal).
// const RETURNING_CUSTOMER_LINK = 'https://insuredbycam.nationaldrivered.com/login?returnUrl=/CourseInfo';

const ACCENT = '#39FF88';
// Gold, not green, for text: the platform has no green text (green stays for buttons and fills).
const GOLD = '#F5D061';
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
          <span><T>{t}</T></span>
        </li>
      ))}
    </ul>
  );
}

function About({ title, steps, listTitle, list, q, a }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:p-8">
      <h3 className="text-xl font-extrabold text-[#0F2D6B]"><T>{title}</T></h3>
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-blue-700"><T k="pages.driversedpage.9ffdb9">How it works</T></p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:font-semibold marker:text-blue-700">
        {steps.map(s => <li key={s}><T>{s}</T></li>)}
      </ol>
      <p className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-blue-700"><T>{listTitle}</T></p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-blue-300">
        {list.map(s => <li key={s}><T>{s}</T></li>)}
      </ul>
      <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-[15px] text-slate-700">
        <span className="font-semibold text-[#0F2D6B]"><T>{q}</T></span> <T>{a}</T>
      </div>
    </div>
  );
}

const FAQ_DD = [
  ['How long do I have access?', 'You have extended access to finish at your own pace. Log in and out as you need to; your progress saves automatically.'],
  ['How do I get my certificate?', 'When you pass the final exam, your certificate is ready to download, and a copy goes to Cam’s office for your discount.'],
  ['What if I need help during the course?', 'Support is available by phone and email during business hours.'],
];
const FAQ_BOTH = [
  ['Can I take both courses?', 'Absolutely! If you’re a parent helping your teen, you can enroll in Defensive Driving for your own insurance discount while your teen completes Joshua’s Law.'],
  ['How long do I have access?', 'Both courses give you extended access to complete at your own pace. You can log in and out as needed, and your progress is automatically saved.'],
  ['Are certificates sent automatically?', 'Joshua’s Law certificates are sent directly to Georgia DDS. Defensive Driving certificates are downloadable for you to submit to your insurer.'],
  ['What if I need help during the course?', 'Both course providers offer customer support via phone and email during extended business hours.'],
];

// The affiliate program has its own page (/affiliates); a short teaser points there.
function AffiliateTeaser() {
  return (
    <section id="partners" className="scroll-mt-4 bg-white py-12 lg:py-16" aria-labelledby="de-partners">
      <div className={`${wrap} flex flex-col items-start gap-5 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-8`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><T k="de.partner.eyebrow">Affiliate Program</T></p>
          <h2 id="de-partners" className="mt-1.5 text-xl font-extrabold text-[#0F2D6B] lg:text-2xl"><T k="de.affiliate.teaser">Saving with the course? Get paid to share a free rate check.</T></h2>
        </div>
        <Link to="/affiliates" className="qb qb-blue qb-md shrink-0 px-6"><T k="de.affiliate.learn">Learn More</T> <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

export default function GeorgiaDriverEducationPage() {
  // Old recruit links (/courses?by=CODE#partners) go to the affiliate page, still credited.
  const navigate = useNavigate();
  useEffect(() => {
    const by = new URLSearchParams(window.location.search).get('by');
    if (by || window.location.hash === '#partners') navigate(`/affiliates${by ? `?by=${encodeURIComponent(by)}` : ''}`, { replace: true });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-white">
      <title>Georgia Driver Education &amp; Insurance Discounts | Cam Wiley Agency</title>

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 50% at 5% 0%, rgba(96,165,250,0.35), transparent 70%), radial-gradient(45% 45% at 100% 100%, rgba(57,255,136,0.18), transparent 70%)' }} />
        <div className={`relative ${wrap}`}>
          <ConsumerNav current="drivers" />
          <div className="pb-10 pt-8 lg:pb-20 lg:pt-14">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}><T k="pages.driversedpage.1bac96">Driver Education · Georgia</T></p>
            <h1 className="mt-3 max-w-3xl text-[36px] font-extrabold leading-[1.08] tracking-tight lg:text-[52px]">
              <T k="de.headline">Georgia Driver Education & Insurance Discounts</T>
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-blue-100 lg:text-lg">
              {SHOW_JOSHUAS_LAW
                ? <T k="de.subhead">Complete your driver education online—whether you’re earning your license or looking to save on insurance. Both courses are 100% online and state-approved.</T>
                : <T k="de.subhead.dd">Complete Georgia’s 6-hour defensive driving course 100% online, at your own pace, and save on your insurance.</T>}
            </p>
            <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              {/* Our own course's portal (it used to go to the outside course site). */}
              <Link to="/courses/defensive-driving/portal"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                <T k="pages.driversedpage.e432d4">Already Enrolled? Continue Your Course</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {/* Same side padding as the pill above, so its text lines up with the pill's text. */}
              <Link to="/affiliates" className="inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-sm font-semibold hover:bg-white/10" style={{ color: GOLD }}>
                <T k="de.partner.herolink">Become an Affiliate</T> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The courses */}
      <section className="bg-slate-50 py-14 lg:py-20">
        <div className={`${wrap} grid gap-6 ${SHOW_JOSHUAS_LAW ? 'lg:grid-cols-2' : 'lg:max-w-3xl'}`}>
          <div className="relative flex flex-col rounded-3xl border-2 bg-white p-6 shadow-[0_0_0_4px_rgba(57,255,136,0.18)] lg:p-8" style={{ borderColor: ACCENT }}>
            <span className="absolute right-5 top-5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ background: ACCENT, color: DEEP }}><T k="pages.driversedpage.df430c">Most popular</T></span>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><T k="pages.driversedpage.e1e44e">Insurance discount</T></p>
            <h2 className="mt-2 pr-28 text-2xl font-extrabold text-[#0F2D6B]"><T k="pages.driversedpage.356a1f">Defensive Driving Course</T></h2>
            <p className="mt-2 text-[15px] text-slate-600"><T k="pages.driversedpage.14e6e6">Save on your insurance premium by completing this 6-hour online defensive driving course. Many Georgia insurers offer recurring discounts.</T></p>
            <div className="mt-5"><Ticks items={['6-hour online course, complete at your own pace', 'Eligible for insurance discounts with most carriers', 'Downloadable completion certificate', 'Available for all ages 18+']} /></div>
            <p className="mt-6 text-3xl font-extrabold text-[#0F2D6B]">$24.95</p>
            <Link to="/courses/defensive-driving"
              className="qb qb-blue qb-lg mt-4 flex w-full">
              <T k="pages.driversedpage.a55c51">Start Defensive Driving Course</T>
            </Link>
          </div>

          {SHOW_JOSHUAS_LAW && <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 lg:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><T k="pages.driversedpage.e9eff1">Teen drivers (15–17)</T></p>
            <h2 className="mt-2 text-2xl font-extrabold text-[#0F2D6B]"><T k="pages.driversedpage.a9deaa">Joshua’s Law Course</T></h2>
            <p className="mt-2 text-[15px] text-slate-600"><T k="pages.driversedpage.299bdc">Required for Georgia teens to get their Class D license. Complete the 30-hour course online to fulfill your driver’s ed requirement.</T></p>
            <div className="mt-5"><Ticks items={['30-hour state-approved curriculum', 'Required for Class D license (ages 15–17)', 'Certificate sent directly to DDS', 'Complete 100% online at your own pace']} /></div>
            <p className="mt-6 text-3xl font-extrabold text-[#0F2D6B]">$29.00</p>
            <a href={JOSHUAS_LAW_LINK} target="_blank" rel="noreferrer"
              className="qb qb-outline qb-lg mt-4 flex w-full border-2 border-blue-700 text-blue-700">
              <T k="pages.driversedpage.6f8ac7">Start Joshua’s Law Course</T>
            </a>
          </div>}
        </div>
      </section>

      <AffiliateTeaser />

      {/* Details */}
      <section className="bg-white py-14 lg:py-20">
        <div className={`${wrap} grid gap-6 ${SHOW_JOSHUAS_LAW ? 'lg:grid-cols-2' : 'lg:max-w-3xl'}`}>
          <About title="About Defensive Driving"
            steps={['Check with your insurer to confirm they accept this course', 'Enroll and complete the 6-hour program at your own pace', 'Download your completion certificate', 'Submit certificate to your insurance company', 'Enjoy your premium discount']}
            listTitle="Course features"
            list={['Works on mobile, tablet, or desktop', 'Mix of text, videos, and animations', 'Automatic progress saving', 'Optional audio read-along', '30-day money-back guarantee']}
            q="Will I get a discount?" a="Most Georgia insurers offer defensive driving discounts, but you should always verify with your specific carrier before enrolling." />
          {SHOW_JOSHUAS_LAW && <About title="About Joshua’s Law"
            steps={['Enroll in the 30-hour online course', 'Complete interactive lessons and quizzes', 'Pass the final exam', 'Certificate automatically sent to Georgia DDS', 'You’re ready to schedule your road test']}
            listTitle="Requirements"
            list={['Required for teens ages 15–17 in Georgia', 'Must complete before applying for Class D license', 'No in-person classroom attendance needed', 'Self-paced with 12-month access', '30-day money-back guarantee']}
            q="Is this state-approved?" a="Yes, this course is fully approved by the Georgia Department of Driver Services and satisfies Joshua’s Law requirements." />}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-14 lg:py-20" aria-labelledby="de-faq">
        <div className={wrap}>
          <h2 id="de-faq" className={sectionTitle}><T k="pages.driversedpage.af2a4d">Frequently Asked Questions</T></h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-2">
            {(SHOW_JOSHUAS_LAW ? FAQ_BOTH : FAQ_DD).map(([q, a]) => (
              <div key={q} className="rounded-3xl border border-slate-200 bg-white p-6">
                <dt className="font-bold text-[#0F2D6B]"><T>{q}</T></dt>
                <dd className="mt-2 text-[15px] text-slate-600"><T>{a}</T></dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The rate check ask */}
      <section className="relative overflow-hidden py-16 text-center text-white lg:py-20" style={{ background: HERO_BG }}>
        <div className={`relative ${wrap}`}>
          <h2 className="text-[30px] font-extrabold leading-tight tracking-tight lg:text-[40px]"><T k="pages.driversedpage.35a223">Need an Insurance Quote?</T></h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-blue-100"><T k="pages.driversedpage.021418">Snap your declarations page. Cam checks if Allstate can beat it.</T></p>
          <Link to={rateCheckStart('drivers_ed')} className="qb qb-gold qb-lg mx-auto mt-7 px-8 text-lg">
            <T k="pages.driversedpage.725f04">Check My Rate</T> <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Disclosure + footer */}
      <div className="border-t border-slate-200 bg-slate-50 pt-8">
        <p className={`${wrap} mb-6 text-[11px] leading-relaxed text-slate-500`}>
          <T k="pages.driversedpage.ca207b">Some programs on this page are partner or affiliate offers. If you enroll through these links, insuredbycam.com may earn a commission at no extra cost to you. Only programs that provide real safety or savings benefits are recommended here. *Pricing shown is approximate and may vary based on active promotions—see partner site for current rates.</T>
        </p>
        <RateCheckFooter wide />
      </div>
    </div>
  );
}
