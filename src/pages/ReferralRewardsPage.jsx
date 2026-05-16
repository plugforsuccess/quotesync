// src/pages/ReferralRewardsPage.jsx
// Staff workspace for the referral reward system. Any active agency member
// (principal + sales/service staff) can log referral names for the current
// month. The winner is drawn automatically by a pg_cron job at the start of
// the next month — there is no manual draw button by design.
// Route: /agency/referrals

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Trophy, Trash2, Loader2, Plus, ExternalLink, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  currentDrawPeriod,
  useReferralEntries,
  useReferralDraws,
  useAddReferralEntry,
  useDeleteReferralEntry,
} from '../hooks/useReferralRewards';
import PageSpinner from '../components/PageSpinner';
import { useCountdown } from '../hooks/useCountdown';

function endOfMonthET() {
  // First day of next month at 00:00 ET, expressed as a Date.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value); // 1-12
  // Date.UTC for the 1st of next month, then shift so it lands at ET midnight.
  // ET is UTC-5/-4; using 05:00 UTC is a safe approximation of ET midnight
  // for a human-facing countdown.
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return new Date(Date.UTC(nextYear, nextMonth - 1, 1, 5, 0, 0));
}

function formatPeriod(period) {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export default function ReferralRewardsPage() {
  const { currentAgencyId } = useAuth();
  const period = currentDrawPeriod();

  const { data: entries = [], isLoading } = useReferralEntries(currentAgencyId, period);
  const { data: draws = [] } = useReferralDraws(currentAgencyId);
  const addEntry = useAddReferralEntry(currentAgencyId, period);
  const deleteEntry = useDeleteReferralEntry(currentAgencyId, period);

  const [referrerName, setReferrerName] = useState('');
  const [referredCustomer, setReferredCustomer] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);

  const deadline = useMemo(() => endOfMonthET(), []);
  const countdown = useCountdown(deadline);

  const pastWinners = useMemo(
    () => draws.filter((d) => d.draw_period !== period),
    [draws, period]
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError(null);
    const name = referrerName.trim();
    if (!name) {
      setFormError('Enter the name of the customer who referred someone.');
      return;
    }
    try {
      await addEntry.mutateAsync({
        referrerName: name,
        referredCustomer: referredCustomer.trim(),
        note: note.trim(),
      });
      setReferrerName('');
      setReferredCustomer('');
      setNote('');
    } catch (err) {
      setFormError(err.message || 'Could not save. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this referral entry from this month’s draw?')) return;
    try {
      await deleteEntry.mutateAsync(id);
    } catch (err) {
      console.error('Failed to delete referral entry:', err);
    }
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary-50 text-primary-600">
            <Gift className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Referral Rewards</h1>
            <p className="text-sm text-gray-500">
              {formatPeriod(period)} drawing &middot; {entries.length}{' '}
              {entries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>
        <Link
          to="/giveaway"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          View public page
        </Link>
      </div>

      {/* Countdown */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-2xl p-6 mb-6">
        <p className="text-sm uppercase tracking-wide text-primary-100 mb-3">
          Winner drawn automatically in
        </p>
        <div className="flex gap-4">
          {[
            ['Days', countdown.days],
            ['Hours', countdown.hours],
            ['Min', countdown.minutes],
            ['Sec', countdown.seconds],
          ].map(([label, val]) => (
            <div key={label} className="text-center">
              <div className="text-3xl sm:text-4xl font-bold tabular-nums">
                {String(val).padStart(2, '0')}
              </div>
              <div className="text-xs text-primary-100 uppercase">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-primary-100 mt-4">
          A random winner is selected server-side at the start of next month. No
          manual draw needed.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Add form */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-600" /> Add a referral
          </h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Referring customer&apos;s name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={referrerName}
                onChange={(e) => setReferrerName(e.target.value)}
                placeholder="e.g. Jane Doe"
                maxLength={120}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Who they referred <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={referredCustomer}
                onChange={(e) => setReferredCustomer(e.target.value)}
                placeholder="e.g. John Smith"
                maxLength={120}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Policy type, branch, etc."
                maxLength={280}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
            <button
              type="submit"
              disabled={addEntry.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {addEntry.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add to this month&apos;s drawing
            </button>
          </form>
        </div>

        {/* Entry list */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-600" /> This month&apos;s entries
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No referrals logged yet for {formatPeriod(period)}.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {entry.referrer_name}
                    </p>
                    {entry.referred_customer && (
                      <p className="text-sm text-gray-500 truncate">
                        Referred: {entry.referred_customer}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-xs text-gray-400 truncate">{entry.note}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    aria-label="Remove entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Past winners */}
      {pastWinners.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Past winners
          </h2>
          <ul className="divide-y divide-gray-100">
            {pastWinners.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span className="text-gray-600">{formatPeriod(d.draw_period)}</span>
                <span className="font-medium text-gray-900">
                  {d.status === 'no_entries'
                    ? 'No entries'
                    : d.winner_display_name || '—'}
                </span>
                <span className="text-gray-400">
                  {d.entry_count} {d.entry_count === 1 ? 'entry' : 'entries'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
