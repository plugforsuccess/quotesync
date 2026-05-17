// src/pages/ReferralRewardsPage.jsx
// Staff workspace for the referral reward system. Entries are materialized
// server-side from real quoted GA leads (one per product line) — staff
// cannot hand-add those. Staff can register a referrer / log a call-in
// referral, and view this month's entries. The winner is drawn
// automatically by a pg_cron job at the start of the next month.
// Route: /agency/referrals

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  Trophy,
  Trash2,
  Loader2,
  Plus,
  ExternalLink,
  Users,
  Link2,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  currentDrawPeriod,
  useReferralEntries,
  useReferralDraws,
  useLogReferral,
  useDeleteReferralEntry,
  useReferrerLinks,
  useCreateReferrerLink,
  useSetReferralPayout,
  useReferralOps,
} from '../hooks/useReferralRewards';
import PageSpinner from '../components/PageSpinner';
import { useCountdown } from '../hooks/useCountdown';

const JACKPOT_FLOOR = 1000;
const JACKPOT_PER_ENTRY = 20;
const JACKPOT_CEILING = 5000;

// Mirrors the server's referral_jackpot_cents() so staff see the same
// climbing pot the public page shows.
function liveJackpotDollars(entryCount) {
  return Math.min(
    JACKPOT_CEILING,
    JACKPOT_FLOOR + JACKPOT_PER_ENTRY * Math.max(entryCount, 0)
  );
}

function money(dollars) {
  return `$${Number(dollars || 0).toLocaleString('en-US')}`;
}

function endOfMonthET() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
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
  const logReferral = useLogReferral(currentAgencyId, period);
  const deleteEntry = useDeleteReferralEntry(currentAgencyId, period);
  const { data: ops } = useReferralOps(currentAgencyId, period);
  const { data: links = [] } = useReferrerLinks(currentAgencyId);
  const createLink = useCreateReferrerLink(currentAgencyId);
  const setPayout = useSetReferralPayout(currentAgencyId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);

  const [linkName, setLinkName] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [linkState, setLinkState] = useState('');
  const [linkError, setLinkError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const shareUrl = (code) => `${window.location.origin}/?ref=${code}`;

  const handleCreateLink = async (e) => {
    e.preventDefault();
    setLinkError(null);
    if (!linkName.trim()) {
      setLinkError('Enter the referrer’s name.');
      return;
    }
    if (linkState.trim() && !/^[A-Za-z]{2}$/.test(linkState.trim())) {
      setLinkError('State must be a 2-letter code (e.g. GA).');
      return;
    }
    try {
      await createLink.mutateAsync({
        name: linkName,
        phone: linkPhone,
        state: linkState,
      });
      setLinkName('');
      setLinkPhone('');
      setLinkState('');
    } catch (err) {
      setLinkError(err.message || 'Could not create link.');
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(shareUrl(link.referral_code));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setLinkError('Copy failed — select and copy the link manually.');
    }
  };

  const handlePayout = async (drawId, status, method) => {
    try {
      await setPayout.mutateAsync({ drawId, status, method });
    } catch (err) {
      console.error('Payout update failed:', err);
      alert(err.message || 'Could not update payout.');
    }
  };

  const deadline = useMemo(() => endOfMonthET(), []);
  const countdown = useCountdown(deadline);
  const jackpot = liveJackpotDollars(entries.length);

  const pastWinners = useMemo(
    () => draws.filter((d) => d.draw_period !== period),
    [draws, period]
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError(null);
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Enter the name of the customer who referred someone.');
      return;
    }
    const cleanState = state.trim();
    if (cleanState && !/^[A-Za-z]{2}$/.test(cleanState)) {
      setFormError('State must be a 2-letter code (e.g. GA).');
      return;
    }
    try {
      await logReferral.mutateAsync({
        name: cleanName,
        phone,
        state: cleanState,
        note,
      });
      setName('');
      setPhone('');
      setState('');
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

      {/* Jackpot + countdown */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-wide text-primary-100 mb-1">
              This month&apos;s jackpot
            </p>
            <p className="text-4xl sm:text-5xl font-extrabold tabular-nums">
              {money(jackpot)}
            </p>
            <p className="text-xs text-primary-100 mt-1">
              Grows {money(JACKPOT_PER_ENTRY)} per entry · up to{' '}
              {money(JACKPOT_CEILING)}
            </p>
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-primary-100 mb-2">
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
                  <div className="text-2xl sm:text-3xl font-bold tabular-nums">
                    {String(val).padStart(2, '0')}
                  </div>
                  <div className="text-xs text-primary-100 uppercase">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-primary-100 mt-4">
          Entries are created automatically when a referred Georgia lead is
          quoted (one per product line). A random GA-resident winner is
          selected server-side at the start of next month.
        </p>
      </div>

      {/* Program health */}
      {ops && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Program health</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              ['Entries', ops.entries_total ?? 0],
              ['From quotes', ops.entries_quoted ?? 0],
              ['Inferred', ops.entries_inferred ?? 0],
              ['Manual', ops.entries_manual ?? 0],
              ['Referrers', ops.distinct_referrers ?? 0],
              ['GA-eligible', ops.eligible_referrers ?? 0],
              ['Missing state', ops.referrers_missing_state ?? 0],
              ['Draw', ops.draw_status ?? 'open'],
            ].map(([label, val]) => (
              <div key={label}>
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    label === 'Missing state' && Number(val) > 0
                      ? 'text-amber-600'
                      : 'text-gray-900'
                  }`}
                >
                  {val}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>
          {Number(ops.referrers_missing_state) > 0 && (
            <p className="text-xs text-amber-600 mt-3">
              {ops.referrers_missing_state} referrer(s) have no state on file
              and can&apos;t win until it&apos;s set — add it on their entry or
              link.
            </p>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Log a call-in referral */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary-600" /> Log a call-in referral
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Use this when someone calls in and names who referred them. Quoted
            web leads are entered automatically — don&apos;t re-add them here.
          </p>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Referring customer&apos;s name{' '}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                maxLength={120}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  maxLength={32}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="GA"
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Only Georgia-resident referrers are eligible to win the cash
              prize (anyone may still refer).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Who they referred, branch, etc."
                maxLength={280}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button
              type="submit"
              disabled={logReferral.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {logReferral.isPending ? (
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
            <Users className="w-4 h-4 text-primary-600" /> This month&apos;s
            entries
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">
              No referrals logged yet for {formatPeriod(period)}.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {entries.map((entry) => {
                const ref = entry.referrer;
                const isGA =
                  (ref?.state || '').trim().toUpperCase() === 'GA';
                const leadName = entry.lead
                  ? `${entry.lead.first_name || ''} ${
                      entry.lead.last_name || ''
                    }`.trim()
                  : null;
                return (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {ref?.name || 'Unknown referrer'}
                        </p>
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            isGA
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {isGA ? 'GA · eligible' : 'not eligible to win'}
                        </span>
                        {entry.product_line && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium capitalize">
                            {entry.product_line}
                          </span>
                        )}
                      </div>
                      {leadName && (
                        <p className="text-sm text-gray-500 truncate">
                          Referred: {leadName}
                        </p>
                      )}
                      {entry.note && (
                        <p className="text-xs text-gray-400 truncate">
                          {entry.note}
                        </p>
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
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Shareable referral links */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary-600" /> Shareable referral
          links
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Create a personal link for a customer. Quotes from anyone who uses
          it are auto-attributed. Capture their state — only Georgia residents
          can win.
        </p>
        <form
          onSubmit={handleCreateLink}
          className="flex flex-wrap items-end gap-2 mb-4"
        >
          <input
            type="text"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            placeholder="Customer name"
            maxLength={120}
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="tel"
            value={linkPhone}
            onChange={(e) => setLinkPhone(e.target.value)}
            placeholder="Phone (optional)"
            maxLength={32}
            className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="text"
            value={linkState}
            onChange={(e) => setLinkState(e.target.value)}
            placeholder="ST"
            maxLength={2}
            className="w-16 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={createLink.isPending}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {createLink.isPending ? 'Creating…' : 'Create link'}
          </button>
        </form>
        {linkError && (
          <p className="text-sm text-red-600 mb-3">{linkError}</p>
        )}
        {links.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            No referral links yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {links.map((l) => {
              const isGA = (l.state || '').toUpperCase() === 'GA';
              return (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {l.name}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isGA
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {isGA ? 'GA · eligible' : 'not eligible to win'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {shareUrl(l.referral_code)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(l)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                  >
                    {copiedId === l.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Past winners */}
      {pastWinners.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mt-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Past winners
          </h2>
          <ul className="divide-y divide-gray-100">
            {pastWinners.map((d) => {
              const won = d.status !== 'no_entries';
              const w = d.winner_referrer;
              const payColor =
                d.payout_status === 'paid'
                  ? 'bg-green-100 text-green-700'
                  : d.payout_status === 'void'
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-amber-100 text-amber-700';
              return (
                <li key={d.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-600 w-28 shrink-0">
                      {formatPeriod(d.draw_period)}
                    </span>
                    <span className="font-medium text-gray-900 flex-1 truncate">
                      {won ? d.winner_display_name || '—' : 'No eligible entries'}
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {won && d.jackpot_cents
                        ? `${money(d.jackpot_cents / 100)} · `
                        : ''}
                      {d.entry_count}{' '}
                      {d.entry_count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  {won && (
                    <div className="flex flex-wrap items-center gap-2 mt-2 pl-28">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${payColor}`}
                      >
                        {d.payout_status}
                        {d.payout_method ? ` · ${d.payout_method}` : ''}
                      </span>
                      {w && (
                        <span className="text-xs text-gray-500">
                          {w.name}
                          {w.phone ? ` · ${w.phone}` : ''}
                          {w.email ? ` · ${w.email}` : ''}
                        </span>
                      )}
                      {d.payout_status !== 'paid' && (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handlePayout(d.id, 'paid', 'zelle')
                            }
                            className="text-[11px] px-2 py-0.5 rounded bg-primary-50 text-primary-700 hover:bg-primary-100"
                          >
                            Mark paid (Zelle)
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePayout(d.id, 'paid', 'ach')}
                            className="text-[11px] px-2 py-0.5 rounded bg-primary-50 text-primary-700 hover:bg-primary-100"
                          >
                            ACH
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePayout(d.id, 'void', null)
                            }
                            className="text-[11px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 hover:bg-gray-100"
                          >
                            Void
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
