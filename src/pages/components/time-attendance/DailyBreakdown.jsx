// src/pages/components/time-attendance/DailyBreakdown.jsx
// Per-day granularity table within the weekly scorecard.

import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';

const LOW_OUTBOUND_THRESHOLD = 4;

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  return `${day} ${date}`;
}

export default function DailyBreakdown({ rcData }) {
  const [expanded, setExpanded] = useState(false);

  const daily = rcData?.daily_breakdown || [];

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
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Outbound</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Inbound</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Answered</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Missed</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Avg Handle</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {daily.map((day, idx) => {
                const outbound = day.outbound_calls || 0;
                const isLow = outbound < LOW_OUTBOUND_THRESHOLD;
                const isZero = (day.total_calls || 0) === 0;

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-gray-50 transition-colors ${isLow ? 'bg-yellow-50/50' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-sm text-gray-900 font-medium">
                      {day.date ? formatDayLabel(day.date) : `Day ${idx + 1}`}
                    </td>
                    <td className={`px-4 py-2.5 text-sm text-right font-semibold ${isLow ? 'text-red-600' : 'text-gray-700'}`}>
                      {outbound}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {day.inbound_calls || 0}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {day.answered_calls ?? day.inbound_calls ?? 0}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {day.missed_calls || 0}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-gray-600">
                      {(day.avg_handle_time_minutes || 0).toFixed(1)} min
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {isZero ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Zero
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
