// src/pages/components/time-attendance/DailyBreakdown.jsx
// Per-day granularity table within the weekly scorecard.
// Supports both legacy rcData.daily_breakdown and call-log-derived daily data.

import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';

const LOW_OUTBOUND_THRESHOLD = 4;
const BUSINESS_TZ = 'America/New_York';

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  return `${day} ${date}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function parseLegacyDailyBreakdown(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (d) => d && typeof d === 'object' && ('outbound_calls' in d || 'total_calls' in d || 'inbound_calls' in d || 'date' in d)
    );
  } catch {
    return [];
  }
}

export default function DailyBreakdown({ rcData, callLogDaily }) {
  const [expanded, setExpanded] = useState(false);

  // Prefer call-log-derived daily data over legacy
  const useCallLog = callLogDaily && callLogDaily.length > 0;
  const daily = useCallLog ? callLogDaily : parseLegacyDailyBreakdown(rcData?.daily_breakdown);

  if (daily.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <CalendarDays className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Daily Detail</h4>
        {useCallLog && (
          <span className="text-xs text-blue-500 font-normal ml-1">(from call log)</span>
        )}
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Day</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Out Attempts</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">In Answered</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">In Missed</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Avg Handle</th>
                {useCallLog && (
                  <>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">First Call</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Last Call</th>
                  </>
                )}
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {daily.map((day, idx) => {
                // Normalize field names between call-log and legacy formats
                const outbound = useCallLog ? (day.outbound || 0) : (day.outbound_calls || 0);
                const answered = useCallLog ? (day.answered || 0) : (day.answered_calls ?? day.inbound_calls ?? 0);
                const missed = useCallLog ? (day.missed || 0) : (day.missed_calls || 0);
                const total = useCallLog ? (day.total || 0) : (day.total_calls || (outbound + (day.inbound_calls || 0)));
                const avgHandle = useCallLog
                  ? (day.handle_count > 0 ? (day.handle_seconds / day.handle_count / 60) : 0)
                  : (day.avg_handle_time_minutes || 0);

                const isZeroOutbound = outbound === 0;
                const isLow = outbound < LOW_OUTBOUND_THRESHOLD;
                const isZero = total === 0;

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-gray-50 transition-colors ${isZeroOutbound ? 'bg-red-50/50' : isLow ? 'bg-yellow-50/50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium">
                      {day.date ? formatDayLabel(day.date) : `Day ${idx + 1}`}
                    </td>
                    <td className={`px-4 py-2.5 text-sm text-right font-semibold ${isZeroOutbound ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-gray-700'}`}>
                      {outbound}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {answered}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {missed}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-700 font-medium">
                      {total}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {avgHandle.toFixed(1)}m
                    </td>
                    {useCallLog && (
                      <>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                          {formatTime(day.first_call_time)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                          {formatTime(day.last_call_time)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-center">
                      {isZero ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Zero
                        </span>
                      ) : isZeroOutbound ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> No Out
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Low
                        </span>
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
