// src/pages/ReferralGiveawayPage.jsx
// Public, no-auth page for the monthly referral giveaway. Shows a live
// countdown to the next draw, a spinning prize wheel, the running entry
// count, and the most recent winner (first name + last initial only).
// Route: /giveaway   (optional ?agency=slug, mirroring the funnel)

import { useMemo } from 'react';
import { Gift, Trophy, Sparkles } from 'lucide-react';
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

export default function ReferralGiveawayPage() {
  const slug = useMemo(
    () => new URLSearchParams(window.location.search).get('agency'),
    []
  );
  const { data, isLoading, isError } = useReferralGiveaway(slug);

  if (isLoading) return <PageSpinner />;

  if (isError || !data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Gift className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Giveaway unavailable
          </h1>
          <p className="text-gray-500">
            We couldn&apos;t load the referral giveaway right now. Please check
            back soon.
          </p>
        </div>
      </div>
    );
  }

  const brand = data.agency?.brand_name || 'Our Agency';
  const deadline = new Date(data.period_ends_at);
  const entryCount = data.current_entry_count || 0;
  const lastWinner = data.last_winner;

  return (
    <div className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-primary-100 text-sm font-medium mb-6">
          <Sparkles className="w-4 h-4" />
          {brand} Monthly Referral Giveaway
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">
          Refer a friend. Win the draw.
        </h1>
        <p className="text-primary-100 max-w-xl mx-auto mb-10">
          Every customer who sends us a referral this month is entered into the{' '}
          {formatPeriod(data.current_period)} prize drawing. One winner is
          picked at random at the start of next month.
        </p>

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
              {entryCount === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
          {/* Pointer */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-[14px] border-l-transparent border-r-transparent border-t-amber-300" />
        </div>

        <p className="text-sm uppercase tracking-wide text-primary-100 mb-4">
          Next draw in
        </p>
        <CountdownBlock deadline={deadline} />
        <p className="text-primary-100 text-sm mt-4">
          Drawing held {formatDrawDate(deadline)}
        </p>

        {/* Latest winner */}
        <div className="mt-12">
          {lastWinner ? (
            <div className="inline-flex flex-col items-center bg-white rounded-2xl px-8 py-6 shadow-xl">
              <Trophy className="w-8 h-8 text-amber-500 mb-2" />
              <p className="text-xs uppercase tracking-wide text-gray-400">
                {formatPeriod(lastWinner.period)} winner
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {lastWinner.display_name}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Chosen at random from {lastWinner.entry_count}{' '}
                {lastWinner.entry_count === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          ) : (
            <p className="text-primary-100 text-sm">
              The first winner will be announced here after this month&apos;s
              draw.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
