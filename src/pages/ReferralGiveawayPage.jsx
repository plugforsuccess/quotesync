// src/pages/ReferralGiveawayPage.jsx
// Public, no-auth page for the monthly referral giveaway. Shows the live
// escalating cash jackpot, a countdown to the next draw, a spinning prize
// wheel, the running entry count, and the most recent winner (first name +
// last initial only). An info icon opens the rules & limitations.
// Route: /giveaway   (optional ?agency=slug, mirroring the funnel)

import { T } from '../components/SiteCopy';
import { useEffect, useMemo, useState } from 'react';
import { Gift, Trophy, Sparkles, Info, X } from 'lucide-react';
import { useReferralGiveaway } from '../hooks/useReferralRewards';
import { useCountdown } from '../hooks/useCountdown';
import PageSpinner from '../components/PageSpinner';

function formatPeriod(period) {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// The draw runs in the early hours of the 1st (ET); pin the displayed date
// to America/New_York so every viewer sees the same drawing day.
function formatDrawDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

function money(cents) {
  return `$${Math.round(Number(cents || 0) / 100).toLocaleString('en-US')}`;
}

function CountdownBlock({ deadline }) {
  const c = useCountdown(deadline);
  const cells = [
    ['Days', c.days],
    ['Hours', c.hours],
    ['Minutes', c.minutes],
    ['Seconds', c.seconds],
  ];
  return (
    <div className="flex justify-center gap-3 sm:gap-5">
      {cells.map(([label, val]) => (
        <div
          key={label}
          className="bg-white/10 backdrop-blur rounded-xl px-3 sm:px-5 py-3 min-w-[64px] sm:min-w-[84px]"
        >
          <div className="text-3xl sm:text-5xl font-bold tabular-nums text-white">
            {String(val).padStart(2, '0')}
          </div>
          <div className="text-[10px] sm:text-xs uppercase tracking-wide text-primary-100 mt-1">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function RulesModal({ brand, floor, ceiling, rulesHref, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rules = [
    [
      'Who can refer',
      'Anyone can refer family or friends — referrers do not need to be a customer or live in Georgia.',
    ],
    [
      'Who can win',
      'Only referrers who are Georgia residents are eligible to win the cash prize. Out-of-state referrals still help, but cannot win.',
    ],
    [
      'How entries work',
      'A referred person must be a Georgia resident we can quote. You earn one entry for each product line we quote them for (auto, home, landlord) — so a bundled referral earns more entries.',
    ],
    [
      'Entry limit',
      'Refer as many people as you like. For fairness, a single referrer’s odds are capped at 10 entries toward each monthly drawing.',
    ],
    [
      'The jackpot',
      `Starts at ${money(floor)} and grows $20 with every entry, up to ${money(
        ceiling
      )}. It resets at the start of each month.`,
    ],
    [
      'The drawing',
      'One winner is selected at random shortly after the 1st of the following month (Eastern Time). The winning entry is drawn from all eligible Georgia-resident referrers.',
    ],
    [
      'The prize',
      'The jackpot is paid in cash via Zelle or ACH transfer. Winners may need to provide tax information for prizes of $600 or more.',
    ],
    [
      'No purchase necessary',
      'No purchase is necessary to enter or win, and a purchase will not improve your chances of winning. See the official rules for the free alternate method of entry and full terms.',
    ],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Giveaway rules and limitations"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">
            <T k="pages.referralgiveawaypage.39da29">Rules & Limitations</T>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            {brand} <T k="pages.referralgiveawaypage.492ed7">Monthly Referral Giveaway</T>
          </p>
          <dl className="space-y-4">
            {rules.map(([term, desc]) => (
              <div key={term}>
                <dt className="text-sm font-semibold text-gray-900">{term}</dt>
                <dd className="text-sm text-gray-600 mt-0.5">{desc}</dd>
              </div>
            ))}
          </dl>
          <a
            href={rulesHref}
            className="inline-block text-sm font-medium text-primary-600 hover:text-primary-700 underline underline-offset-2"
          >
            <T k="pages.referralgiveawaypage.130905">Read the full official rules</T>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ReferralGiveawayPage() {
  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get('agency'),
    []
  );
  const { data, isLoading, isError } = useReferralGiveaway(slug);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (isLoading) return <PageSpinner />;

  if (isError || !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Gift className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            <T k="pages.referralgiveawaypage.452af0">Giveaway Unavailable</T>
          </h1>
          <p className="text-gray-500">
            <T k="pages.referralgiveawaypage.a9b9fc">We couldn't load the referral giveaway right now. Please check
            back soon.</T>
          </p>
        </div>
      </div>
    );
  }

  const brand = data.agency?.brand_name || 'Our Agency';
  const deadline = new Date(data.period_ends_at);
  const entryCount = data.current_entry_count || 0;
  const jackpotCents = data.current_jackpot_cents || 0;
  const floorCents = data.jackpot_floor_cents || 100000;
  const ceilingCents = data.jackpot_ceiling_cents || 500000;
  const lastWinner = data.last_winner;
  const rulesHref = slug
    ? `/giveaway/rules?agency=${encodeURIComponent(slug)}`
    : '/giveaway/rules';

  return (
    <div className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-20 text-center">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-primary-100 text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            {brand} <T k="pages.referralgiveawaypage.492ed7">Monthly Referral Giveaway</T>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-white/15 text-primary-100 hover:text-white transition-colors"
              aria-label="View rules and limitations"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">
          <T k="pages.referralgiveawaypage.e48437">Refer family or friends. Win the draw.</T>
        </h1>
        <p className="text-primary-100 max-w-xl mx-auto mb-8">
          <T k="pages.referralgiveawaypage.8d6b60">Every Georgia referral we quote this month is entered into the</T>{' '}
          {formatPeriod(data.current_period)} <T k="pages.referralgiveawaypage.769cab">cash drawing. One winner is picked
          at random at the start of next month.</T>
        </p>

        {/* Live escalating jackpot */}
        <div className="mb-10">
          <p className="text-sm uppercase tracking-wide text-primary-100 mb-1">
            <T k="pages.referralgiveawaypage.e8a51a">This month's jackpot</T>
          </p>
          <p className="text-5xl sm:text-7xl font-extrabold text-amber-300 tabular-nums drop-shadow">
            {money(jackpotCents)}
          </p>
          <p className="text-primary-100 text-sm mt-2">
            <T k="pages.referralgiveawaypage.6cd813">Grows $20 with every referral · up to</T> {money(ceilingCents)}{' '}
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="underline underline-offset-2 hover:text-white"
            >
              <T k="pages.referralgiveawaypage.25bacc">See Rules</T>
            </button>
          </p>
        </div>

        {/* Spinning prize wheel */}
        <div className="relative mx-auto mb-10 w-48 h-48 sm:w-60 sm:h-60">
          <div
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              animationDuration: '6s',
              background:
                'conic-gradient(#fbbf24 0deg 45deg, #ffffff 45deg 90deg, #fbbf24 90deg 135deg, #ffffff 135deg 180deg, #fbbf24 180deg 225deg, #ffffff 225deg 270deg, #fbbf24 270deg 315deg, #ffffff 315deg 360deg)',
            }}
          />
          <div className="absolute inset-[14%] rounded-full bg-primary-800 flex flex-col items-center justify-center">
            <Gift className="w-9 h-9 sm:w-12 sm:h-12 text-amber-300 mb-1" />
            <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
              {entryCount}
            </span>
            <span className="text-[10px] sm:text-xs uppercase tracking-wide text-primary-200">
              {entryCount === 1 ? <T k="pages.referralgiveawaypage.19172e">{'Entry'}</T> : <T k="pages.referralgiveawaypage.f056d0">{'Entries'}</T>}
            </span>
          </div>
          {/* Pointer */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent border-t-amber-300" />
        </div>

        <p className="text-sm uppercase tracking-wide text-primary-100 mb-4">
          <T k="pages.referralgiveawaypage.93cdf0">Next draw in</T>
        </p>
        <CountdownBlock deadline={deadline} />
        <p className="text-primary-100 text-sm mt-4">
          <T k="pages.referralgiveawaypage.f83b53">Drawing held</T> {formatDrawDate(deadline)}
        </p>

        {/* Latest winner */}
        <div className="mt-12">
          {lastWinner ? (
            <div className="inline-flex flex-col items-center bg-white rounded-2xl px-8 py-6 shadow-xl">
              <Trophy className="w-8 h-8 text-amber-500 mb-2" />
              <p className="text-xs uppercase tracking-wide text-gray-400">
                {formatPeriod(lastWinner.period)} <T k="pages.referralgiveawaypage.85f940">winner</T>
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {lastWinner.display_name}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                <T k="pages.referralgiveawaypage.b273fb">Won</T> {money(lastWinner.jackpot_cents)} <T k="pages.referralgiveawaypage.701eb6">· chosen at random from</T>{' '}
                {lastWinner.entry_count}{' '}
                {lastWinner.entry_count === 1 ? <T k="pages.referralgiveawaypage.61c412">{'entry'}</T> : <T k="pages.referralgiveawaypage.c2e311">{'entries'}</T>}
              </p>
            </div>
          ) : (
            <p className="text-primary-100 text-sm">
              <T k="pages.referralgiveawaypage.cf2d22">The first winner will be announced here after this month's
              draw.</T>
            </p>
          )}
        </div>
      </div>

      {rulesOpen && (
        <RulesModal
          brand={brand}
          floor={floorCents}
          ceiling={ceilingCents}
          rulesHref={rulesHref}
          onClose={() => setRulesOpen(false)}
        />
      )}
    </div>
  );
}
