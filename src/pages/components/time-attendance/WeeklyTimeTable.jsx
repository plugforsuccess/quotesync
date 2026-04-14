// src/pages/components/time-attendance/WeeklyTimeTable.jsx
// Admin editable weekly time entry table — pre-filled with REG/OFFICE defaults
// Cameron enters the full week and only modifies exception days.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getFederalHolidays, getHolidayLabel } from '../../../lib/federalHolidays';

const CODES = [
  { value: 'REG', label: 'Regular' },
  { value: 'WFH', label: 'WFH' },
  { value: 'SICK', label: 'Sick' },
  { value: 'SICK_PART', label: 'Sick (Part)' },
  { value: 'PTO', label: 'PTO' },
  { value: 'APPT', label: 'Appointment' },
  { value: 'EARLY', label: 'Early' },
  { value: 'HOLIDAY', label: 'Holiday' },
];

const LOCATIONS = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'WFH', label: 'WFH' },
];

// Full-day absence codes — no time fields needed
const NO_TIME_CODES = ['PTO', 'SICK', 'HOLIDAY'];
// Codes that require notes
const NOTES_REQUIRED_CODES = ['SICK_PART', 'APPT', 'EARLY'];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const DEFAULT_ROW = {
  code: 'REG',
  location: 'OFFICE',
  startTime: '09:00',
  lunchOut: '12:00',
  lunchIn: '13:00',
  endTime: '18:00',
  unpaidBreak: 0,
  notes: '',
};

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayIdx = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${DAY_LABELS[dayIdx]} ${month}/${day}`;
}

// Strip seconds from time strings like "09:00:00" → "09:00"
function normalizeTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

export default function WeeklyTimeTable({
  weekStart,
  employeeId,
  orgId,
  existingEntries,
  onSaved,
  employeeDefaults,
}) {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const holidays = useMemo(() => {
    const year = parseInt(weekStart.slice(0, 4));
    // Cover year boundary weeks (e.g. Dec 29 – Jan 2)
    const nextYear = year + 1;
    const set = new Set([...getFederalHolidays(year), ...getFederalHolidays(nextYear)]);
    return set;
  }, [weekStart]);

  // Per-employee schedule defaults (fall back to global defaults)
  const scheduleDefaults = {
    startTime: employeeDefaults?.default_start_time?.slice(0, 5) || DEFAULT_ROW.startTime,
    lunchOut: employeeDefaults?.default_lunch_out?.slice(0, 5) || DEFAULT_ROW.lunchOut,
    lunchIn: employeeDefaults?.default_lunch_in?.slice(0, 5) || DEFAULT_ROW.lunchIn,
    endTime: employeeDefaults?.default_end_time?.slice(0, 5) || DEFAULT_ROW.endTime,
  };

  const queryClient = useQueryClient();

  // ── PTO / Sick usage (current calendar year) ─────────────────────────────
  const currentYear = new Date().getFullYear();

  const { data: leaveUsage } = useQuery({
    queryKey: ['leave_usage', employeeId, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_time_entries')
        .select('code, work_date')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeId)
        .gte('work_date', `${currentYear}-01-01`)
        .lte('work_date', `${currentYear}-12-31`);
      if (error) throw error;
      return {
        ptoUsed:  (data || []).filter(e => e.code === 'PTO').length,
        sickUsed: (data || []).filter(e => e.code === 'SICK').length,
      };
    },
    enabled: !!employeeId && !!orgId,
    staleTime: 60 * 1000,
  });

  const ptoUsed  = leaveUsage?.ptoUsed  ?? 0;
  const sickUsed = leaveUsage?.sickUsed ?? 0;

  const ptoDaysPerYear  = employeeDefaults?.pto_days_per_year  ?? 10;
  const sickDaysPerYear = employeeDefaults?.sick_days_per_year ?? 5;
  const ptoEligibleDate = employeeDefaults?.pto_eligible_date  ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const ptoEligible = !ptoEligibleDate || today >= ptoEligibleDate;
  const ptoRemaining = Math.max(0, ptoDaysPerYear - ptoUsed);
  const ptoExhausted = ptoRemaining <= 0;
  const sickOverThreshold = sickUsed >= sickDaysPerYear;

  // Build initial rows: use existing entries if available, else employee defaults
  const buildRows = useCallback(() => {
    return weekDates.map((date) => {
      const existing = existingEntries?.find((e) => e.work_date === date);
      if (existing) {
        return {
          date,
          code: existing.code,
          location: existing.location,
          startTime: normalizeTime(existing.start_time),
          lunchOut: normalizeTime(existing.lunch_out),
          lunchIn: normalizeTime(existing.lunch_in),
          endTime: normalizeTime(existing.end_time),
          unpaidBreak: existing.unpaid_break_minutes || 0,
          notes: existing.notes || '',
        };
      }
      return {
        date,
        code: DEFAULT_ROW.code,
        location: DEFAULT_ROW.location,
        ...scheduleDefaults,
        unpaidBreak: DEFAULT_ROW.unpaidBreak,
        notes: DEFAULT_ROW.notes,
      };
    });
  }, [weekDates, existingEntries, scheduleDefaults.startTime, scheduleDefaults.lunchOut, scheduleDefaults.lunchIn, scheduleDefaults.endTime]);

  const [rows, setRows] = useState(buildRows);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Re-initialize when employee/week/existingEntries change
  useEffect(() => {
    setRows(buildRows());
    setMsg(null);
  }, [buildRows]);

  function updateRow(idx, field, value) {
    // PTO gating — block selection if not eligible or exhausted
    if (field === 'code' && value === 'PTO') {
      if (!ptoEligible) {
        setMsg({
          type: 'error',
          text: `PTO is not available until ${ptoEligibleDate}.`,
        });
        return;
      }
      if (ptoExhausted) {
        setMsg({
          type: 'error',
          text: `All ${ptoDaysPerYear} PTO days for ${currentYear} have been used.`,
        });
        return;
      }
    }

    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value };

      // Auto-adjust logic when code changes
      if (field === 'code') {
        if (NO_TIME_CODES.includes(value)) {
          // Full-day absence — clear time fields
          row.startTime = '';
          row.lunchOut = '';
          row.lunchIn = '';
          row.endTime = '';
        } else if (value === 'WFH') {
          // WFH code → auto-set location
          row.location = 'WFH';
          // Restore defaults if times were cleared
          if (!row.startTime) {
            row.startTime = scheduleDefaults.startTime;
            row.lunchOut = scheduleDefaults.lunchOut;
            row.lunchIn = scheduleDefaults.lunchIn;
            row.endTime = scheduleDefaults.endTime;
          }
        } else {
          // Restore time defaults if switching from a no-time code
          if (!row.startTime) {
            row.startTime = scheduleDefaults.startTime;
            row.lunchOut = scheduleDefaults.lunchOut;
            row.lunchIn = scheduleDefaults.lunchIn;
            row.endTime = scheduleDefaults.endTime;
          }
        }
      }

      next[idx] = row;
      return next;
    });
    setMsg(null);
  }

  // Validation: notes required for certain codes
  const validationErrors = rows.reduce((errs, row, idx) => {
    // Skip validation for holiday rows — they render as read-only banners
    if (holidays.has(row.date)) return errs;
    if (NOTES_REQUIRED_CODES.includes(row.code) && !row.notes.trim()) {
      errs.push(`${formatDayLabel(row.date)}: Notes required for ${row.code}`);
    }
    if (!NO_TIME_CODES.includes(row.code) && (!row.startTime || !row.endTime)) {
      errs.push(`${formatDayLabel(row.date)}: Start and End time required`);
    }
    return errs;
  }, []);

  const canSave = validationErrors.length === 0 && !saving;

  async function saveWeek() {
    if (!canSave) return;
    setSaving(true);
    setMsg(null);

    const entries = rows
      .filter((row) => !holidays.has(row.date))
      .map((row) => ({
        org_id: orgId,
        employee_user_id: employeeId,
        week_start: weekStart,
        work_date: row.date,
        location: row.location,
        code: row.code,
        start_time: row.startTime || null,
        lunch_out: row.lunchOut || null,
        lunch_in: row.lunchIn || null,
        end_time: row.endTime || null,
        unpaid_break_minutes: row.unpaidBreak || 0,
        notes: row.notes?.trim() || null,
      }));

    const { error } = await supabase
      .from('employee_time_entries')
      .upsert(entries, { onConflict: 'employee_user_id,work_date' });

    setSaving(false);

    if (error) {
      setMsg({ type: 'error', text: `Error: ${error.message}` });
    } else {
      setMsg({ type: 'success', text: 'Week saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['leave_usage', employeeId, currentYear] });
      if (onSaved) onSaved();
    }
  }

  const isNoTime = (code) => NO_TIME_CODES.includes(code);

  const inputCls =
    'w-full px-2 py-1.5 text-sm border border-qs-border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-qs-card';
  const selectCls =
    'w-full px-2 py-1.5 text-sm border border-qs-border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-qs-card';
  const disabledInputCls =
    'w-full px-2 py-1.5 text-sm border border-qs-border rounded bg-qs-elevated text-qs-muted cursor-not-allowed';

  return (
    <>
    {/* PTO / Sick balance indicators */}
    {ptoEligible ? (
      <div style={{
        display: 'flex', gap: 16, marginBottom: 12,
        fontSize: 12, color: 'var(--qs-dim)',
      }}>
        <span>
          PTO:{' '}
          <strong style={{ color: ptoExhausted ? '#EF4444' : '#10B981' }}>
            {ptoRemaining} of {ptoDaysPerYear} days remaining
          </strong>
        </span>
        <span>
          Sick:{' '}
          <strong style={{ color: sickOverThreshold ? '#F59E0B' : 'var(--qs-text)' }}>
            {sickUsed} of {sickDaysPerYear} days used
          </strong>
        </span>
      </div>
    ) : (
      <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginBottom: 12 }}>
        PTO eligible from {ptoEligibleDate}
      </div>
    )}

    <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px]">
          <thead className="bg-qs-elevated border-b border-qs-border">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[90px]">Day</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[120px]">Code</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[100px]">Location</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[90px]">Start</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[90px]">Lunch Out</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[90px]">Lunch In</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase w-[90px]">End</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-qs-subtle uppercase flex-1">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            {rows.map((row, idx) => {
              const dateStr = row.date;
              const isHoliday = holidays.has(dateStr);
              const holidayLabel = isHoliday ? getHolidayLabel(dateStr) : null;

              if (isHoliday) {
                return (
                  <tr key={dateStr}>
                    <td className="px-4 py-3 text-sm font-medium text-qs-bright">
                      {formatDayLabel(dateStr)}
                    </td>
                    <td colSpan={7} className="px-4 py-3">
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: '#3B82F611', border: '1px solid #3B82F633',
                        borderRadius: 6, padding: '6px 12px',
                        fontSize: 12, color: '#3B82F6', fontWeight: 500,
                      }}>
                        🏛 {holidayLabel} — Agency closed
                      </div>
                    </td>
                  </tr>
                );
              }

              const noTime = isNoTime(row.code);
              const needsNotes = NOTES_REQUIRED_CODES.includes(row.code);

              return (
                <tr key={row.date} className="hover:bg-qs-elevated/50">
                  <td className="px-3 py-2 text-sm font-medium text-qs-bright whitespace-nowrap">
                    {formatDayLabel(row.date)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.code}
                      onChange={(e) => updateRow(idx, 'code', e.target.value)}
                      className={selectCls}
                    >
                      {CODES.map((c) => {
                        const ptoBlocked = c.value === 'PTO' && (!ptoEligible || ptoExhausted);
                        const label =
                          c.value === 'PTO' && ptoExhausted
                            ? 'PTO (0 days remaining)'
                            : c.value === 'PTO' && !ptoEligible
                            ? `PTO (eligible ${ptoEligibleDate})`
                            : c.label;
                        return (
                          <option key={c.value} value={c.value} disabled={ptoBlocked}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.location}
                      onChange={(e) => updateRow(idx, 'location', e.target.value)}
                      className={selectCls}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={loc.value} value={loc.value}>{loc.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(idx, 'startTime', e.target.value)}
                      disabled={noTime}
                      className={noTime ? disabledInputCls : inputCls}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.lunchOut}
                      onChange={(e) => updateRow(idx, 'lunchOut', e.target.value)}
                      disabled={noTime}
                      className={noTime ? disabledInputCls : inputCls}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.lunchIn}
                      onChange={(e) => updateRow(idx, 'lunchIn', e.target.value)}
                      disabled={noTime}
                      className={noTime ? disabledInputCls : inputCls}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(idx, 'endTime', e.target.value)}
                      disabled={noTime}
                      className={noTime ? disabledInputCls : inputCls}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateRow(idx, 'notes', e.target.value)}
                      placeholder={needsNotes ? 'Required...' : ''}
                      className={`${inputCls} ${needsNotes && !row.notes.trim() ? 'border-red-700/40 focus:ring-red-500 focus:border-red-500' : ''}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="px-4 py-3 bg-red-900/20 border-t border-red-700/40">
          <ul className="text-sm text-red-300 space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sick day soft warning */}
      {rows.some(r => r.code === 'SICK') && sickOverThreshold && (
        <div style={{
          background: '#F59E0B11', borderTop: '1px solid #F59E0B44',
          padding: '10px 14px',
          fontSize: 12, color: '#F59E0B',
        }}>
          ⚠ {sickUsed} sick days used in {currentYear}
          {' '}— exceeds the {sickDaysPerYear}-day advisory threshold.
          Entry will still be saved.
        </div>
      )}

      {/* Save bar */}
      <div className="px-4 py-3 bg-qs-elevated border-t border-qs-border flex items-center gap-3">
        <button
          disabled={!canSave}
          onClick={saveWeek}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Week'}
        </button>
        {msg && (
          <div className={`flex items-center gap-1.5 text-sm ${msg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>

    {/* Code legend */}
    <div className="flex flex-wrap gap-2 text-xs text-qs-subtle mt-3">
      <span><strong className="text-qs-text">REG</strong> Regular</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">WFH</strong> Work from Home</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">SICK</strong> Sick (Full Day)</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">SICK_PART</strong> Sick (Partial)</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">PTO</strong> Paid Time Off</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">APPT</strong> Appointment</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">EARLY</strong> Left Early</span>
      <span className="text-qs-muted">|</span>
      <span><strong className="text-qs-text">HOLIDAY</strong> Federal Holiday</span>
    </div>
    </>
  );
}
