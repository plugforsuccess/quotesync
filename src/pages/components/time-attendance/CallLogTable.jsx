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
      <span className="text-xs text-qs-subtle font-medium">{label}:</span>
      <div className="inline-flex rounded-md border border-qs-border overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-primary-600 text-white'
                : 'bg-qs-card text-qs-dim hover:bg-qs-elevated'
            } ${opt.value !== options[0].value ? 'border-l border-qs-border' : ''}`}
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
    <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2 hover:bg-qs-card transition-colors"
      >
        <PhoneCall className="w-5 h-5 text-primary-400" />
        <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">
          Call Log Detail
        </h4>
        <span className="text-xs text-qs-subtle ml-1">({calls.length} calls)</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-qs-muted ml-auto" />
        ) : (
          <ChevronRight className="w-4 h-4 text-qs-muted ml-auto" />
        )}
      </button>

      {expanded && (
        <div>
          {/* Filters */}
          <div className="px-4 py-2 bg-qs-elevated/50 border-b border-qs-border flex items-center gap-4 flex-wrap">
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
                <span className="text-xs text-qs-subtle font-medium">Date:</span>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="text-xs border border-qs-border rounded-md px-2 py-1 bg-qs-card text-qs-text"
                >
                  <option value="all">All</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>{formatDateLabel(d)}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-xs text-qs-muted ml-auto">{filtered.length} shown</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-qs-elevated sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle w-[100px]">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle w-[80px]">Direction</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle w-[90px]">Result</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-qs-subtle w-[70px]">Duration</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle w-[100px]">Queue</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-qs-border">
                {filtered.map((call) => {
                  const isLong = call.call_length_seconds > 1800;
                  const isMissed = call.call_result === 'VM/Missed';
                  const isFirstOutbound = firstOutboundDates.has(call.id);

                  const borderClass = isMissed
                    ? 'border-l-4 border-l-red-400'
                    : isLong
                      ? 'border-l-4 border-l-amber-400'
                      : 'border-l-4 border-l-transparent';

                  const bgClass = isFirstOutbound ? 'bg-primary-900/20' : '';

                  // Contact: masked phone number of the other party (PII protection)
                  const contact = call.call_direction === 'Outbound'
                    ? maskPhone(call.to_number) || '—'
                    : maskPhone(call.from_number) || '—';

                  return (
                    <tr key={call.id} className={`hover:bg-qs-elevated transition-colors ${borderClass} ${bgClass}`}>
                      <td className="px-4 py-2 text-qs-bright font-medium">
                        {formatTime(call.call_start_time)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          call.call_direction === 'Outbound' ? 'bg-primary-100 text-primary-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {call.call_direction === 'Outbound' ? 'Out' : 'In'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium ${
                          call.call_result === 'VM/Missed' ? 'text-red-400' :
                          call.call_result === 'Not Connected' ? 'text-amber-400' :
                          call.call_result === 'Connected' ? 'text-primary-400' : 'text-emerald-400'
                        }`}>
                          {call.call_result === 'VM/Missed' ? 'Missed' : call.call_result}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-qs-dim font-mono">
                        {formatDuration(call.call_length_seconds)}
                      </td>
                      <td className="px-4 py-2 text-qs-dim">
                        {call.queue_type === 'sales' ? 'Sales' : call.queue_type === 'service' ? 'Service' : '—'}
                      </td>
                      <td className="px-4 py-2 text-qs-subtle truncate max-w-[200px]">
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
