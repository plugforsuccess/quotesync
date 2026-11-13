// src/pages/AffiliatesPage.jsx
// /affiliates: the Cam Wiley Agency affiliate program, said plainly. Affiliates are paid
// per household that sends a dec page through their link (never per sale); they don't
// discuss coverage or prices, and they say they're paid. What it pays comes live from the
// agency's payout rules (rate-check-partner, mode 'program'), so changing the rules
// changes this page. The application is at #apply. A producer's recruit link is
// /affiliates?by=CODE. Same look as the consumer site: royal-blue hero, white cards,
// deep-blue headings. No black.
import { useEffect } from 'react';
import { ArrowRight, BadgeDollarSign, Check, PenLine, Share2, X } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';
import AffiliateApplyForm from '../components/affiliates/AffiliateApplyForm';
import { AFFILIATE_DO as DO, AFFILIATE_DONT as DONT, affiliateRef, amountsFrom, money, ordinal, recruitCode, useAffiliateProgram } from '../lib/affiliates';
import PayTable from '../components/affiliates/PayTable';

const GOLD = '#F5D061';
const DEEP = '#0F2D6B';
const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const wrap = 'mx-auto max-w-6xl px-4 lg:px-8';
const sectionTitle = 'text-[28px] font-extrabold leading-tight tracking-tight text-[#0F2D6B] lg:text-[36px]';
const eyebrow = 'text-xs font-bold uppercase tracking-[0.16em] text-blue-700';
const STEPS = [
  ['1', PenLine, 'Apply', 'It takes a minute. Cam’s team texts you your Affiliate Portal link.'],
  ['2', Share2, 'Share Your Link', 'Send it to people you know. They snap a photo of their insurance declarations page; Cam’s team does the rest.'],
  ['3', BadgeDollarSign, 'Get Paid Monthly', 'For every household that sends their policy through your link, whether or not they buy.'],
];
function Earnings() {
  const p = useAffiliateProgram();
  return (
    <section id="earn" className="scroll-mt-4 bg-slate-50 py-14 lg:py-20" aria-labelledby="aff-earn">
      <div className={`${wrap} grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14`}>
        <div>
          <p className={eyebrow}><T k="aff.earn.eyebrow">What You Earn</T></p>
          <h2 id="aff-earn" className={`mt-2 ${sectionTitle}`}><T k="aff.earn.title">A Flat Fee for Every Household</T></h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            <T k="aff.earn.line">You’re paid for each household that sends their declarations page through your link, by what they send. It’s the same whether or not they buy, and it’s never a share of anyone’s premium or commission.</T>
          </p>
          <ul className="mt-6 space-y-2.5 text-[15px] text-slate-700">
            {p && <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" strokeWidth={3} /><span>Paid monthly, on the {ordinal(p.pay_day)}, for the month before. A month under {money(p.min_payout)} carries over to the next.</span></li>}
            <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" strokeWidth={3} /><span><T k="aff.earn.once">Each household counts once, in the month its first page arrives.</T></span></li>
            <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" strokeWidth={3} /><span><T k="aff.earn.allstate">Households already insured with Allstate don’t count.</T></span></li>
            <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" strokeWidth={3} /><span><T k="aff.earn.w9">You agree to the program terms, and a W-9 is needed before your first payment is issued.</T></span></li>
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Pay per household">
          <p className="text-lg font-extrabold text-[#0F2D6B]"><T k="aff.earn.table">Per Household</T></p>
          {p === null && <p className="mt-4 text-slate-500"><T k="aff.earn.loading">Loading…</T></p>}
          {p === false && <p className="mt-4 text-slate-600"><T k="aff.earn.fallback">The amounts are in your Affiliate Portal after you apply.</T></p>}
          {p && (
            <>
              <PayTable amounts={amountsFrom(p)} extraCap={p.extra_line.cap} label="Pay per household table" className="mt-3" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ['Do I have to be an Allstate customer?', 'No. Customers and non-customers are both welcome.'],
  ['Do the people I refer have to buy anything?', 'No. You’re paid the same whether or not they buy.'],
  ['What does it cost me?', 'Nothing. There’s no fee to join and nothing to buy.'],
  ['Can I post my link on social media?', 'Yes, as long as you say you’re paid for referrals, like “I get a referral fee if you check your rate.”'],
  ['Am I working for Cam Wiley Agency?', 'No. You’re an independent affiliate: not an employee, an agent, or a partner in the business. Either side can end it at any time.'],
  ['What about taxes?', 'Affiliate fees are income. You’ll send a W-9 before your first payment, and you’ll get a tax form at year end when one is required.'],
];

export default function AffiliatesPage() {
  useEffect(() => { recruitCode(); affiliateRef(); }, []); // remember ?by=CODE (a producer) or ?aff=CODE (an affiliate) for the visit
  return (
    <div className="min-h-screen bg-white">
      <title>Become an Affiliate | Cam Wiley Agency</title>

      <section className="relative overflow-hidden text-white" style={{ background: HERO_BG }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 50% at 5% 0%, rgba(96,165,250,0.35), transparent 70%), radial-gradient(45% 45% at 100% 100%, rgba(57,255,136,0.18), transparent 70%)' }} />
        <div className={`relative ${wrap}`}>
          <ConsumerNav current="affiliates" />
          <div className="pb-12 pt-8 lg:pb-20 lg:pt-14">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}><T k="aff.hero.eyebrow">Cam Wiley Agency Affiliate Program</T></p>
            <h1 className="mt-3 max-w-3xl text-[36px] font-extrabold leading-[1.08] tracking-tight lg:text-[52px]">
              <T k="aff.hero.title">Get Paid to Share a Free Rate Check</T>
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-blue-100 lg:text-lg">
              <T k="de.partner.body">Already an Allstate customer? You probably know someone who’s paying too much. As a Cam Wiley Agency affiliate, you get your own Rate Check link, and you’re paid for every household that sends their declarations page through it, whether or not they buy.</T>
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#apply" className="qb qb-gold qb-lg px-7"><T k="aff.hero.apply">Apply in a Minute</T> <ArrowRight className="qb-arrow h-5 w-5" aria-hidden="true" /></a>
              <a href="#earn" className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/30 px-6 text-base font-semibold text-white hover:bg-white/10"><T k="aff.hero.earn">See What You Earn</T></a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-14 lg:py-20" aria-labelledby="aff-how">
        <div className={wrap}>
          <p className={eyebrow}><T k="aff.how.eyebrow">How It Works</T></p>
          <h2 id="aff-how" className={`mt-2 ${sectionTitle}`}><T k="aff.how.title">Three Steps, No Selling</T></h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map(([n, Icon, title, line]) => (
              <li key={n} className="flex gap-4 md:flex-col">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: DEEP, color: GOLD }}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-extrabold text-[#0F2D6B]"><T k={`aff.step${n}.title`}>{title}</T></p>
                  <p className="text-[15px] text-slate-600"><T k={`aff.step${n}.line`}>{line}</T></p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Earnings />

      <section className="bg-white py-14 lg:py-20" aria-labelledby="aff-rules">
        <div className={wrap}>
          <p className={eyebrow}><T k="aff.rules.eyebrow">Straight Talk</T></p>
          <h2 id="aff-rules" className={`mt-2 ${sectionTitle}`}><T k="aff.rules.title">What You Do, and What You Don’t</T></h2>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600"><T k="aff.rules.line">You’re an affiliate, not an insurance agent. You make the introduction; Cam’s licensed team handles every quote.</T></p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <p className="font-extrabold text-[#0F2D6B]"><T k="aff.rules.do">You Do</T></p>
              <ul className="mt-3 space-y-2.5">
                {DO.map(t => <li key={t} className="flex gap-2.5 text-[15px] text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" strokeWidth={3} /><span><T>{t}</T></span></li>)}
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <p className="font-extrabold text-[#0F2D6B]"><T k="aff.rules.dont">You Don’t</T></p>
              <ul className="mt-3 space-y-2.5">
                {DONT.map(t => <li key={t} className="flex gap-2.5 text-[15px] text-slate-700"><X className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" strokeWidth={3} /><span><T>{t}</T></span></li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-14 lg:py-20" aria-labelledby="aff-faq">
        <div className={`${wrap} max-w-3xl`}>
          <h2 id="aff-faq" className={sectionTitle}><T k="aff.faq.title">Questions</T></h2>
          <div className="mt-6 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#0F2D6B]">
                  <T>{q}</T><span className="text-xl text-blue-700 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600"><T>{a}</T></p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="apply" className="scroll-mt-4 bg-white py-14 lg:py-20" aria-labelledby="aff-apply">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start lg:gap-14`}>
          <div>
            <p className={eyebrow}><T k="aff.apply.eyebrow">Apply</T></p>
            <h2 id="aff-apply" className={`mt-2 ${sectionTitle}`}><T k="aff.apply.title">Ready? It Takes a Minute.</T></h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600"><T k="aff.apply.line">Cam’s team reviews every application and texts you within one business day.</T></p>
            <p className="mt-6 text-xs leading-relaxed text-slate-500">
              <T k="de.partner.fine">Allstate customers and non-customers are welcome. Affiliates don’t discuss coverage or prices—Cam’s licensed team handles every quote. Payment follows the affiliate agreement you sign, and a W-9 is needed before your first payment.</T>
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-7">
            <AffiliateApplyForm />
          </div>
        </div>
      </section>

      <RateCheckFooter />
    </div>
  );
}
