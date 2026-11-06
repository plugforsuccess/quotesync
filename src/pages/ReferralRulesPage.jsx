// src/pages/ReferralRulesPage.jsx
// Public, no-auth official rules for the monthly referral giveaway.
// Route: /giveaway/rules  (optional ?agency=slug)
//
// IMPORTANT: the operative mechanics below are accurate to the system, but
// this is a DRAFT framework — the binding official rules, sponsor details,
// the alternate (no-purchase) entry address, and any state registration
// must be finalized by the agency's legal counsel before public promotion.

import { T } from '../components/SiteCopy';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useReferralGiveaway } from '../hooks/useReferralRewards';

function Section({ n, title, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">
        {n}. <T>{title}</T>
      </h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

export default function ReferralRulesPage() {
  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get('agency'),
    []
  );
  const { data } = useReferralGiveaway(slug);
  const brand = data?.agency?.brand_name || 'the Agency';
  const giveawayHref = slug ? `/giveaway?agency=${encodeURIComponent(slug)}` : '/giveaway';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Link
          to={giveawayHref}
          className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> <T k="pages.referralrulespage.4a2a11">Back to the giveaway</T>
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {brand} <T k="pages.referralrulespage.53a45d">Monthly Referral Giveaway — Official Rules</T>
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          <T k="pages.referralrulespage.90a9f5">NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE WILL NOT INCREASE
          YOUR CHANCES OF WINNING.</T>
        </p>

        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong><T k="pages.referralrulespage.f4a149">Draft pending legal review.</T></strong> <T k="pages.referralrulespage.078f3c">The mechanics below
            reflect how the program operates. Final binding rules, the Sponsor
            of record, the no-purchase mail-in entry address, eligibility
            specifics, and any required state sweepstakes registration or
            bonding must be confirmed by</T> {brand}<T k="pages.referralrulespage.8bc40f">'s legal counsel before
            this promotion is advertised to the public.</T>
          </p>
        </div>

        <Section n={1} title="Sponsor">
          <p>
            <T k="pages.referralrulespage.c9eac0">This giveaway is sponsored by</T> {brand}{' '}
            <em><T k="pages.referralrulespage.642d75">[full legal entity name, address — to be completed by counsel]</T></em>.
          </p>
        </Section>

        <Section n={2} title="Eligibility">
          <p>
            <T k="pages.referralrulespage.bee8a7">Open to individuals who are at least 18 years old (or the age of
            majority in their jurisdiction). Employees of the Sponsor and their
            immediate family/household members are not eligible to win. Void
            where prohibited or restricted by law.</T>
          </p>
          <p>
            <strong><T k="pages.referralrulespage.2e4fe2">Anyone may refer</T></strong> <T k="pages.referralrulespage.c7f10e">family or friends regardless of
            where the referrer lives. However,</T>{' '}
            <strong>
              <T k="pages.referralrulespage.d8361c">only referrers who are residents of the State of Georgia are
              eligible to win</T>
            </strong>{' '}
            <T k="pages.referralrulespage.2cc8be">the cash prize, because the Sponsor only writes Georgia risk.</T>
          </p>
        </Section>

        <Section n={3} title="Entry period & how to enter">
          <p>
            <T k="pages.referralrulespage.cd052b">A new drawing runs each calendar month (the “Entry Period”),
            measured in U.S. Eastern Time.</T>
          </p>
          <p>
            <strong><T k="pages.referralrulespage.e19290">Standard entry:</T></strong> <T k="pages.referralrulespage.4b9bfa">Refer a person who resides in
            Georgia. You receive one (1) entry for each insurance product line
            the Sponsor quotes for that referred person (auto, home, landlord).
            A referral that produces no quote earns no entry.</T>
          </p>
          <p>
            <strong>
              <T k="pages.referralrulespage.c1f706">Free alternate method of entry (no purchase / no referral
              necessary):</T>
            </strong>{' '}
            <T k="pages.referralrulespage.370cfd">Hand-print your full name, address, phone, email, and the words
            “Referral Giveaway — [month/year]” on a 3×5 card and mail it to</T>{' '}
            <em>
              <T k="pages.referralrulespage.2716c6">[Sponsor mail-in entry address — to be completed by counsel]</T>
            </em>
            <T k="pages.referralrulespage.289a1c">. Limit one alternate entry per outer envelope; it must be received
            during the Entry Period. Mail-in entries have an equal chance of
            winning as standard entries.</T>
          </p>
        </Section>

        <Section n={4} title="Entry limit">
          <p>
            <T k="pages.referralrulespage.fed284">There is no limit on how many people you may refer. For fairness,
            any single referrer’s odds in a given monthly drawing are capped at
            a maximum of ten (10) entries.</T>
          </p>
        </Section>

        <Section n={5} title="Prize & odds">
          <p>
            <T k="pages.referralrulespage.349b36">One (1) cash prize is awarded per monthly drawing. The prize amount
            starts at $1,000 and increases by $20 for each qualifying entry
            received that month, up to a maximum of $5,000. The prize resets at
            the start of each month.</T>
          </p>
          <p>
            <T k="pages.referralrulespage.851eb8">Odds of winning depend on the number of eligible entries received
            during the Entry Period.</T>
          </p>
        </Section>

        <Section n={6} title="Winner selection & notification">
          <p>
            <T k="pages.referralrulespage.792a0e">One winner is selected at random from all eligible
            Georgia-resident referrers shortly after the 1st of the following
            month. The winner will be contacted using the information on file
            and may be required to verify identity and Georgia residency.</T>
          </p>
        </Section>

        <Section n={7} title="Prize payment & taxes">
          <p>
            <T k="pages.referralrulespage.a5a0c2">The prize is paid in cash via Zelle or ACH transfer. Prizes are
            taxable; for any prize of $600 or more in a calendar year the
            winner must provide a completed IRS Form W-9 before payment, and a
            Form 1099 may be issued. The winner is solely responsible for all
            applicable taxes.</T>
          </p>
        </Section>

        <Section n={8} title="Privacy & general conditions">
          <p>
            <T k="pages.referralrulespage.ff8495">Information collected is used to administer the giveaway and to
            quote insurance, in accordance with the Sponsor’s privacy policy.
            By participating, entrants agree to these rules and the decisions
            of the Sponsor, which are final. The Sponsor may modify or
            terminate the promotion if it cannot run as planned.</T>{' '}
            <em>
              <T k="pages.referralrulespage.163784">[Insurance anti-rebating compliance language and any required
              state registration to be confirmed by counsel.]</T>
            </em>
          </p>
        </Section>
      </div>
    </div>
  );
}
