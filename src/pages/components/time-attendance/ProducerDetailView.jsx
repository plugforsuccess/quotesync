// src/pages/components/time-attendance/ProducerDetailView.jsx
// Simplified producer scorecard: outbound effort summary, 8-week trend, daily breakdown.
// No grades, no PDF export — this is Cameron's visibility tool for producer call effort.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, TrendingUp, CalendarDays, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';
import { computeAttendance } from '../../../lib/attendanceUtils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekRange(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  return `${day} ${date}`;
}

function parseDailyBreakdown(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (d) => d && typeof d === 'object' && ('outbound_calls' in d || 'total_calls' in d || 'date' in d)
    );
  } catch {
    return [];
  }
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, target, unit }) {
  const hasTarget = target != null && target > 0;
  const met = hasTarget && value >= target;

  return (
    <div className="bg-qs-card rounded-lg border border-qs-border p-4">
      <p className="text-xs font-medium text-qs-subtle uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-qs-bright mt-1">
        {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
        {unit && <span className="text-lg font-normal text-qs-subtle ml-1">{unit}</span>}
      </p>
      {hasTarget && (
        <p className={`text-xs mt-1 ${met ? 'text-emerald-400' : 'text-orange-600'}`}>
          Target: {target}{unit ? ` ${unit}` : ''} {met ? '(met)' : '(below)'}
        </p>
      )}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ProducerDetailView({ rcData, employeeName, weekStart, trendData, targets, producerId, ytdEntries, hireDate, currentYear }) {
  const [dailyExpanded, setDailyExpanded] = useState(true);

  if (!rcData) {
    return (
      <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
        <Phone className="w-16 h-16 text-qs-muted mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-qs-bright mb-2">No performance data</h2>
        <p className="text-qs-dim">Upload RingCentral data for this week to see producer metrics.</p>
      </div>
    );
  }

  const ytdStart = `${currentYear}-01-01`;
  const ytdEnd = `${currentYear}-12-31`;
  const ytdAttendance = computeAttendance(
    producerId,
    hireDate,
    ytdEntries || [],
    ytdStart,
    ytdEnd
  );

  const outbound = rcData.outbound_calls || 0;
  const avgCallsDay = rcData.avg_calls_per_day || 0;
  const totalCalls = rcData.total_calls || 0;
  const avgHandleOut = rcData.avg_handle_time_out_minutes || 0;

  const outboundTarget = targets?.outbound_calls_weekly;
  const avgCallsDayTarget = targets?.avg_calls_per_day;

  // Build trend chart data
  const chartData = (trendData || []).map((rc) => ({
    label: formatWeekLabel(rc.week_start),
    weekStart: rc.week_start,
    outbound: rc.outbound_calls || 0,
  }));

  const daily = parseDailyBreakdown(rcData.daily_breakdown);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-qs-card rounded-lg border border-qs-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Phone className="w-6 h-6 text-primary-400" />
              <h2 className="text-xl font-bold text-qs-bright">{employeeName}</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-qs-subtle">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                Producer
              </span>
              <span>{formatWeekRange(weekStart)}</span>
            </div>
          </div>
          {producerId && (
            <Link
              to={`/admin/producers/${producerId}/comp-model`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-900/20 hover:bg-qs-card border border-emerald-700/40 rounded-lg transition-colors"
            >
              <DollarSign className="w-3.5 h-3.5" />
              Comp Model
            </Link>
          )}
        </div>
      </div>

      {/* Outbound Effort Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Outbound Calls" value={outbound} target={outboundTarget} />
        <StatCard label="Avg Calls / Day" value={avgCallsDay} target={avgCallsDayTarget} />
        <StatCard label="Total Calls" value={totalCalls} />
        <StatCard label="Avg Handle (Out)" value={avgHandleOut} unit="min" />
      </div>

      {/* YTD Attendance */}
      <div className="bg-qs-card rounded-lg border border-qs-border p-4">
        <p className="text-xs font-medium text-qs-subtle uppercase tracking-wide mb-3">
          YTD Attendance ({currentYear})
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.daysWorked}</p>
            <p className="text-xs text-qs-subtle mt-0.5">Days Worked</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${ytdAttendance.sick > 0 ? 'text-amber-400' : 'text-qs-bright'}`}>
              {ytdAttendance.sick}
            </p>
            <p className="text-xs text-qs-subtle mt-0.5">Sick</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${ytdAttendance.pto > 0 ? 'text-blue-400' : 'text-qs-bright'}`}>
              {ytdAttendance.pto}
            </p>
            <p className="text-xs text-qs-subtle mt-0.5">PTO</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.appt}</p>
            <p className="text-xs text-qs-subtle mt-0.5">Appt</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.early}</p>
            <p className="text-xs text-qs-subtle mt-0.5">Early Out</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${ytdAttendance.unexcused > 0 ? 'text-red-400' : 'text-qs-bright'}`}>
              {ytdAttendance.unexcused}
            </p>
            <p className="text-xs text-qs-subtle mt-0.5">Unexcused</p>
          </div>
        </div>
      </div>

      {/* 8-Week Trend */}
      {chartData.length >= 2 ? (
        <div className="bg-qs-card rounded-lg border border-qs-border p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary-400" />
            <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">8-Week Outbound Trend</h4>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => [value, 'Outbound']}
                labelStyle={{ fontWeight: 600 }}
              />
              {outboundTarget && (
                <ReferenceLine
                  y={outboundTarget}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `${outboundTarget}/wk`, position: 'right', fontSize: 10, fill: '#ef4444' }}
                />
              )}
              <Line
                type="monotone"
                dataKey="outbound"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-qs-card rounded-lg border border-qs-border p-8 text-center">
          <TrendingUp className="w-12 h-12 text-qs-muted mx-auto mb-3" />
          <p className="text-qs-subtle font-medium">Trend data requires at least 2 weeks of uploaded RingCentral reports.</p>
          <p className="text-sm text-qs-muted mt-1">Keep uploading weekly and trends will appear here.</p>
        </div>
      )}

      {/* Daily Breakdown */}
      {daily.length > 0 && (
        <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
          <button
            onClick={() => setDailyExpanded(!dailyExpanded)}
            className="w-full px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2 hover:bg-qs-card transition-colors"
          >
            <CalendarDays className="w-5 h-5 text-primary-400" />
            <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Daily Detail</h4>
            {dailyExpanded
              ? <ChevronDown className="w-4 h-4 text-qs-muted ml-auto" />
              : <ChevronRight className="w-4 h-4 text-qs-muted ml-auto" />}
          </button>

          {dailyExpanded && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-qs-elevated">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Day</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-qs-subtle uppercase">Outbound</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-qs-subtle uppercase">Total Calls</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-qs-subtle uppercase">Avg Handle (Out)</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-qs-subtle uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-qs-border">
                  {daily.map((day, idx) => {
                    const ob = day.outbound_calls || 0;
                    const isZeroOutbound = ob === 0;

                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-qs-elevated transition-colors ${isZeroOutbound ? 'bg-amber-900/20' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-sm text-qs-bright font-medium">
                          {day.date ? formatDayLabel(day.date) : `Day ${idx + 1}`}
                        </td>
                        <td className={`px-4 py-2.5 text-sm text-right font-semibold ${isZeroOutbound ? 'text-red-400' : 'text-qs-text'}`}>
                          {ob}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-qs-dim">
                          {day.total_calls || 0}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-qs-dim">
                          {(day.avg_handle_time_out_minutes || day.avg_handle_time_minutes || 0).toFixed(1)} min
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {isZeroOutbound ? (
                            <span className="inline-flex items-center gap-1 text-xs text-orange-600 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" /> No Outbound
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
      )}
    </div>
  );
}
