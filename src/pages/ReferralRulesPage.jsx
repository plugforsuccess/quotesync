// src/pages/ReferralRulesPage.jsx
// Public, no-auth official rules for the monthly referral giveaway.
// Route: /giveaway/rules  (optional ?agency=slug)
//
// IMPORTANT: the operative mechanics below are accurate to the system, but
// this is a DRAFT framework — the binding official rules, sponsor details,
// the alternate (no-purchase) entry address, and any state registration
// must be finalized by the agency's legal counsel before public promotion.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useReferralGiveaway } from '../hooks/useReferralRewards';

function Section({ n, title, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">
        {n}. {title}
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
          <ArrowLeft className="w-4 h-4" /> Back to the giveaway
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {brand} Monthly Referral Giveaway — Official Rules
        </h1>
        <p className="text-xs text-gray-500 mb-6">
          NO PURCHASE NECESSARY TO ENTER OR WIN. A PURCHASE WILL NOT INCREASE
          YOUR CHANCES OF WINNING.
        </p>

        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Draft pending legal review.</strong> The mechanics below
            reflect how the program operates. Final binding rules, the Sponsor
            of record, the no-purchase mail-in entry address, eligibility
            specifics, and any required state sweepstakes registration or
            bonding must be confirmed by {brand}&apos;s legal counsel before
            this promotion is advertised to the public.
          </p>
        </div>

        <Section n={1} title="Sponsor">
          <p>
            This giveaway is sponsored by {brand}{' '}
            <em>[full legal entity name, address — to be completed by counsel]</em>.
          </p>
        </Section>

        <Section n={2} title="Eligibility">
          <p>
            Open to individuals who are at least 18 years old (or the age of
            majority in their jurisdiction). Employees of the Sponsor and their
            immediate family/household members are not eligible to win. Void
            where prohibited or restricted by law.
          </p>
          <p>
            <strong>Anyone may refer</strong> family or friends regardless of
            where the referrer lives. However,{' '}
            <strong>
              only referrers who are residents of the State of Georgia are
              eligible to win
            </strong>{' '}
            the cash prize, because the Sponsor only writes Georgia risk.
          </p>
        </Section>

        <Section n={3} title="Entry period & how to enter">
          <p>
            A new drawing runs each calendar month (the “Entry Period”),
            measured in U.S. Eastern Time.
          </p>
          <p>
            <strong>Standard entry:</strong> Refer a person who resides in
            Georgia. You receive one (1) entry for each insurance product line
            the Sponsor quotes for that referred person (auto, home, landlord).
            A referral that produces no quote earns no entry.
          </p>
          <p>
            <strong>
              Free alternate method of entry (no purchase / no referral
              necessary):
            </strong>{' '}
            Hand-print your full name, address, phone, email, and the words
            “Referral Giveaway — [month/year]” on a 3×5 card and mail it to{' '}
            <em>
              [Sponsor mail-in entry address — to be completed by counsel]
            </em>
            . Limit one alternate entry per outer envelope; it must be received
            during the Entry Period. Mail-in entries have an equal chance of
            winning as standard entries.
          </p>
        </Section>

        <Section n={4} title="Entry limit">
          <p>
            There is no limit on how many people you may refer. For fairness,
            any single referrer’s odds in a given monthly drawing are capped at
            a maximum of ten (10) entries.
          </p>
        </Section>

        <Section n={5} title="Prize & odds">
          <p>
            One (1) cash prize is awarded per monthly drawing. The prize amount
            starts at $1,000 and increases by $20 for each qualifying entry
            received that month, up to a maximum of $5,000. The prize resets at
            the start of each month.
          </p>
          <p>
            Odds of winning depend on the number of eligible entries received
            during the Entry Period.
          </p>
        </Section>

        <Section n={6} title="Winner selection & notification">
          <p>
            One winner is selected at random from all eligible
            Georgia-resident referrers shortly after the 1st of the following
            month. The winner will be contacted using the information on file
            and may be required to verify identity and Georgia residency.
          </p>
        </Section>

        <Section n={7} title="Prize payment & taxes">
          <p>
            The prize is paid in cash via Zelle or ACH transfer. Prizes are
            taxable; for any prize of $600 or more in a calendar year the
            winner must provide a completed IRS Form W-9 before payment, and a
            Form 1099 may be issued. The winner is solely responsible for all
            applicable taxes.
          </p>
        </Section>

        <Section n={8} title="Privacy & general conditions">
          <p>
            Information collected is used to administer the giveaway and to
            quote insurance, in accordance with the Sponsor’s privacy policy.
            By participating, entrants agree to these rules and the decisions
            of the Sponsor, which are final. The Sponsor may modify or
            terminate the promotion if it cannot run as planned.{' '}
            <em>
              [Insurance anti-rebating compliance language and any required
              state registration to be confirmed by counsel.]
            </em>
          </p>
        </Section>
      </div>
    </div>
  );
}
