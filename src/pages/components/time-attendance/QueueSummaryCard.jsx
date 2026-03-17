// src/pages/components/time-attendance/QueueSummaryCard.jsx
// Compact summary card showing per-queue totals for the selected week.
// Shows which dates have queue data uploaded and which are missing.

import { BarChart3 } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function cleanQueueName(name) {
  if (!name) return name;
  return name.replace(/^\w+\s+/, '');
}

function getWorkdaysInRange(weekStart, count) {
  const days = [];
  const start = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekOfLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function abandonRateColor(rate, inbound) {
  if (inbound === 0) return 'text-qs-muted';
  if (rate >= 25) return 'text-red-400';
  if (rate >= 10) return 'text-amber-400';
  return 'text-emerald-400';
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function QueueSummaryCard({ queueData = [], weekStart }) {
  if (!queueData || queueData.length === 0) return null;

  // Aggregate per-queue across all dates in the week
  const queueMap = {};
  for (const q of queueData) {
    const name = q.queue_name;
    if (!queueMap[name]) {
      queueMap[name] = { queue_name: name, inbound: 0, answered: 0, abandoned: 0 };
    }
    queueMap[name].inbound += q.inbound;
    queueMap[name].answered += q.answered;
    queueMap[name].abandoned += q.abandoned;
  }

  const queues = Object.values(queueMap).sort((a, b) => b.inbound - a.inbound);
  const totals = queues.reduce(
    (acc, q) => ({
      inbound: acc.inbound + q.inbound,
      answered: acc.answered + q.answered,
      abandoned: acc.abandoned + q.abandoned,
    }),
    { inbound: 0, answered: 0, abandoned: 0 }
  );
  const totalAbandonRate = totals.inbound > 0 ? (totals.abandoned / totals.inbound) * 100 : 0;

  // Determine which dates have data
  const workdays = getWorkdaysInRange(weekStart, 5);
  const datesWithData = new Set(queueData.map((q) => q.report_date));
  const presentDates = workdays.filter((d) => datesWithData.has(d));
  const missingDates = workdays.filter((d) => !datesWithData.has(d));

  return (
    <div className="bg-qs-card rounded-lg border border-qs-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="w-5 h-5 text-indigo-400" />
        <h3 className="text-base font-semibold text-qs-bright">
          Queue Coverage &mdash; Week of {formatWeekOfLabel(weekStart)}
        </h3>
      </div>

      <div className="overflow-x-auto border border-qs-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-qs-elevated">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-qs-dim">Queue</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">In</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">Ans</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">Abn</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">Abn Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            {queues.map((q, i) => {
              const rate = q.inbound > 0 ? (q.abandoned / q.inbound) * 100 : 0;
              return (
                <tr key={i} className="hover:bg-qs-elevated">
                  <td className="px-3 py-2 text-qs-bright">{cleanQueueName(q.queue_name)}</td>
                  <td className="px-3 py-2 text-right text-qs-dim">{q.inbound}</td>
                  <td className="px-3 py-2 text-right text-qs-dim">{q.answered}</td>
                  <td className="px-3 py-2 text-right text-qs-dim">{q.abandoned}</td>
                  <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(rate, q.inbound)}`}>
                    {q.inbound > 0 ? `${rate.toFixed(0)}%` : '\u2014'}
                    {q.inbound > 0 && rate >= 25 && <span className="text-red-500 ml-1">&#x1F534;</span>}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="bg-qs-elevated font-medium">
              <td className="px-3 py-2 text-qs-bright">Total</td>
              <td className="px-3 py-2 text-right text-qs-text">{totals.inbound}</td>
              <td className="px-3 py-2 text-right text-qs-text">{totals.answered}</td>
              <td className="px-3 py-2 text-right text-qs-text">{totals.abandoned}</td>
              <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(totalAbandonRate, totals.inbound)}`}>
                {totals.inbound > 0 ? `${totalAbandonRate.toFixed(0)}%` : '\u2014'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Date coverage note */}
      <div className="mt-3 text-xs text-qs-subtle">
        {missingDates.length === 0 ? (
          <span>Data for: {presentDates.map(formatDateShort).join(', ')}</span>
        ) : (
          <span>
            Data for: {presentDates.map(formatDateShort).join(', ') || 'none'}
            {missingDates.length > 0 && (
              <span className="text-amber-400 ml-1">
                ({missingDates.map(formatDateShort).join(', ')} missing)
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
