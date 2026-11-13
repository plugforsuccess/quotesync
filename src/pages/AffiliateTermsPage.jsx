// src/pages/AffiliateTermsPage.jsx
// /affiliates/terms: the Affiliate Program Terms, in plain language. Affiliates agree to
// these (and to texts about the program) on the application or on portal step 1. Built
// from the same rules and live pay as /affiliates; the Do / Don't lines are the same editable
// text, so an edit on either page shows on both. Until the attorney-reviewed affiliate
// agreement is ready, this is what they agree to; when it is, it replaces this page.
// Same look as the consumer site. No black.
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { T } from '../components/SiteCopy';
import { ConsumerNav, RateCheckFooter } from '../components/ConsumerNav';
import { AFFILIATE_DO, AFFILIATE_DONT, AFFILIATE_TERMS_VERSION, money, ordinal, tierLabel, useAffiliateProgram } from '../lib/affiliates';

const HERO_BG = 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)';
const h2 = 'text-xl font-extrabold text-[#0F2D6B]';
const body = 'mt-2 space-y-2 text-[15px] leading-relaxed text-slate-700';

function Section({ n, title, children }) {
  return (
    <section className="border-t border-slate-200 py-7 first:border-t-0 first:pt-0" aria-labelledby={`terms-${n}`}>
      <h2 id={`terms-${n}`} className={h2}>{n}. <T>{title}</T></h2>
      <div className={body}>{children}</div>
    </section>
  );
}

export default function AffiliateTermsPage() {
  const p = useAffiliateProgram();
  return (
    <div className="min-h-screen bg-white">
      <title>Affiliate Program Terms | Cam Wiley Agency</title>
      <section className="text-white" style={{ background: HERO_BG }}>
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <ConsumerNav current="affiliates" />
          <div className="pb-10 pt-6 lg:pb-14">
            <h1 className="text-[32px] font-extrabold leading-tight tracking-tight lg:text-[44px]"><T k="aff.terms.title">Affiliate Program Terms</T></h1>
            <p className="mt-3 text-blue-100"><T k="aff.terms.sub">The rules of the Cam Wiley Agency, Inc. affiliate program, in plain language.</T></p>
            <p className="mt-2 text-sm text-blue-200" data-copy="fixed">Version {AFFILIATE_TERMS_VERSION}</p>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8 lg:py-14">
        <Section n={1} title="What You Do">
          <ul className="space-y-2">
            {AFFILIATE_DO.map(t => <li key={t} className="flex gap-2.5"><Check className="mt-1 h-4 w-4 shrink-0 text-blue-700" strokeWidth={3} aria-hidden="true" /><span><T>{t}</T></span></li>)}
          </ul>
        </Section>

        <Section n={2} title="What You Don’t Do">
          <ul className="space-y-2">
            {AFFILIATE_DONT.map(t => <li key={t} className="flex gap-2.5"><X className="mt-1 h-4 w-4 shrink-0 text-red-600" strokeWidth={3} aria-hidden="true" /><span><T>{t}</T></span></li>)}
          </ul>
        </Section>

        <Section n={3} title="How You’re Paid">
          <p><T k="aff.terms.pay">You’re paid a flat fee for each household that sends their declarations page through your link, by what they send. It’s the same whether or not they buy, and it’s never a share of anyone’s premium or commission.</T></p>
          {p && (
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4" aria-label="Pay per household">
              {p.tiers.map(t => (
                <div key={t.key} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt>{tierLabel(t.label)}</dt><dd className="font-bold tabular-nums text-[#0F2D6B]">{money(t.amount)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt>Each Extra Line, Up to {p.extra_line.cap}</dt><dd className="font-bold tabular-nums text-[#0F2D6B]">+{money(p.extra_line.amount)}</dd>
              </div>
            </dl>
          )}
          <ul className="list-disc space-y-1.5 pl-5">
            {p && <li>Paid monthly, on the {ordinal(p.pay_day)}, for the month before. A month under {money(p.min_payout)} carries over to the next.</li>}
            <li><T k="aff.terms.once">Each household counts once, in the month its first page arrives.</T></li>
            <li><T k="aff.terms.excluded">Households already insured with Allstate, your own household, repeats, and pages that can’t be read or have expired don’t count.</T></li>
            <li><T k="aff.terms.w9">A signed W-9 is needed before your first payment.</T></li>
            <li><T k="aff.terms.changes">If the pay changes, you’ll see it in your Affiliate Portal before it applies.</T></li>
          </ul>
        </Section>

        <Section n={4} title="Texts">
          <p><T k="aff.terms.texts">By agreeing, you agree to get texts from Cam Wiley Agency, Inc. at the number you give us about your application and the program: your Affiliate Portal link, setup steps and pay updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Opting out of texts doesn’t end your affiliate status.</T></p>
        </Section>

        <Section n={5} title="You’re Independent">
          <p><T k="aff.terms.independent">You’re an independent affiliate: not an employee, agent or partner of Cam Wiley Agency, Inc. or Allstate. You can’t sell, quote or give advice about insurance for us. Either side can end this at any time. We may pause your link if these rules aren’t followed.</T></p>
        </Section>

        <Section n={6} title="Taxes">
          <p><T k="aff.terms.taxes">Affiliate fees are income. You’ll get a tax form at year end when one is required.</T></p>
        </Section>

        <Section n={7} title="Your Information">
          <p><T k="aff.terms.privacy">We use your information to run the program and pay you, and we keep your tax details private.</T> <Link to="/privacy" className="font-semibold text-blue-700 underline underline-offset-2"><T k="aff.terms.privacy-link">Privacy Policy</T></Link></p>
        </Section>

        <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
          <T k="aff.terms.future">A fuller affiliate agreement may replace these terms. If it does, we’ll ask you to agree to it in your Affiliate Portal.</T>
        </p>
        <p className="mt-6"><Link to="/affiliates" className="font-semibold text-blue-700 underline underline-offset-2"><T k="aff.terms.back">Back to the Affiliate Program</T></Link></p>
      </main>
      <RateCheckFooter />
    </div>
  );
}
