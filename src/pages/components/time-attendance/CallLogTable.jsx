// src/pages/components/time-attendance/CallLogTable.jsx
// Filterable, scrollable table showing individual call records for an employee.

import { useState, useMemo } from 'react';
import { PhoneCall, ChevronDown, ChevronRight } from 'lucide-react';

// Business timezone for consistent time display
const BUSINESS_TZ = 'America/New_York';

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Mask phone numbers for PII protection.
 * Shows only last 4 digits: ***-***-1234
 */
function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `***-***-${digits.slice(-4)}`;
  }
  return '***';
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

// ── Filter Pill ─────────────────────────────────────────────────────────────────

function FilterPill({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 font-medium">{label}:</span>
      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            } ${opt.value !== options[0].value ? 'border-l border-gray-300' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function CallLogTable({ calls }) {
  const [expanded, setExpanded] = useState(false);
  const [dirFilter, setDirFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  if (!calls || calls.length === 0) return null;

  // Get unique dates for date filter
  const dates = useMemo(() => {
    const set = new Set(calls.map((c) => c.call_date));
    return [...set].sort();
  }, [calls]);

  const filtered = useMemo(() => {
    return calls.filter((c) => {
      if (dirFilter !== 'all' && c.call_direction !== dirFilter) return false;
      if (resultFilter !== 'all') {
        if (resultFilter === 'Missed' && c.call_result !== 'VM/Missed') return false;
        if (resultFilter !== 'Missed' && c.call_result !== resultFilter) return false;
      }
      if (queueFilter !== 'all' && (c.queue_type || 'none') !== queueFilter) return false;
      if (dateFilter !== 'all' && c.call_date !== dateFilter) return false;
      return true;
    });
  }, [calls, dirFilter, resultFilter, queueFilter, dateFilter]);

  // Track first outbound per day for highlighting
  const firstOutboundDates = useMemo(() => {
    const map = {};
    const sorted = [...calls]
      .filter((c) => c.call_direction === 'Outbound')
      .sort((a, b) => a.call_start_time.localeCompare(b.call_start_time));
    for (const c of sorted) {
      if (!map[c.call_date]) map[c.call_date] = c.id;
    }
    return new Set(Object.values(map));
  }, [calls]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <PhoneCall className="w-5 h-5 text-blue-600" />
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
          Call Log Detail
        </h4>
        <span className="text-xs text-gray-500 ml-1">({calls.length} calls)</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
        )}
      </button>

      {expanded && (
        <div>
          {/* Filters */}
          <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-200 flex items-center gap-4 flex-wrap">
            <FilterPill
              label="Direction"
              options={[
                { value: 'all', label: 'All' },
                { value: 'Inbound', label: 'Inbound' },
                { value: 'Outbound', label: 'Outbound' },
              ]}
              value={dirFilter}
              onChange={setDirFilter}
            />
            <FilterPill
              label="Result"
              options={[
                { value: 'all', label: 'All' },
                { value: 'Answered', label: 'Answered' },
                { value: 'Connected', label: 'Connected' },
                { value: 'Not Connected', label: 'Not Connected' },
                { value: 'Missed', label: 'Missed' },
              ]}
              value={resultFilter}
              onChange={setResultFilter}
            />
            <FilterPill
              label="Queue"
              options={[
                { value: 'all', label: 'All' },
                { value: 'sales', label: 'Sales' },
                { value: 'service', label: 'Service' },
              ]}
              value={queueFilter}
              onChange={setQueueFilter}
            />
            {dates.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">Date:</span>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700"
                >
                  <option value="all">All</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} shown</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-[100px]">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-[80px]">Direction</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-[90px]">Result</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 w-[70px]">Duration</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 w-[100px]">Queue</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((call) => {
                  const isLong = call.call_length_seconds > 1800;
                  const isMissed = call.call_result === 'VM/Missed';
                  const isFirstOutbound = firstOutboundDates.has(call.id);

                  const borderClass = isMissed
                    ? 'border-l-4 border-l-red-400'
                    : isLong
                      ? 'border-l-4 border-l-amber-400'
                      : 'border-l-4 border-l-transparent';

                  const bgClass = isFirstOutbound ? 'bg-blue-50/30' : '';

                  // Contact: masked phone number of the other party (PII protection)
                  const contact = call.call_direction === 'Outbound'
                    ? maskPhone(call.to_number) || '—'
                    : maskPhone(call.from_number) || '—';

                  return (
                    <tr key={call.id} className={`hover:bg-gray-50 transition-colors ${borderClass} ${bgClass}`}>
                      <td className="px-4 py-2 text-gray-900 font-medium">
                        {formatTime(call.call_start_time)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          call.call_direction === 'Outbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {call.call_direction === 'Outbound' ? 'Out' : 'In'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium ${
                          call.call_result === 'VM/Missed' ? 'text-red-600' :
                          call.call_result === 'Not Connected' ? 'text-amber-600' :
                          call.call_result === 'Connected' ? 'text-blue-600' : 'text-green-600'
                        }`}>
                          {call.call_result === 'VM/Missed' ? 'Missed' : call.call_result}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600 font-mono">
                        {formatDuration(call.call_length_seconds)}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {call.queue_type === 'sales' ? 'Sales' : call.queue_type === 'service' ? 'Service' : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-500 truncate max-w-[200px]">
                        {contact}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
