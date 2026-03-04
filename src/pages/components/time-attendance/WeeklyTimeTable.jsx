// src/pages/components/time-attendance/WeeklyTimeTable.jsx
// Admin editable weekly time entry table — pre-filled with REG/OFFICE defaults
// Cameron enters the full week and only modifies exception days.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CODES = [
  { value: 'REG', label: 'Regular' },
  { value: 'WFH', label: 'WFH' },
  { value: 'SICK', label: 'Sick' },
  { value: 'SICK_PART', label: 'Sick (Part)' },
  { value: 'PTO', label: 'PTO' },
  { value: 'APPT', label: 'Appointment' },
  { value: 'EARLY', label: 'Early' },
];

const LOCATIONS = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'WFH', label: 'WFH' },
];

// Full-day absence codes — no time fields needed
const NO_TIME_CODES = ['PTO', 'SICK'];
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

  // Per-employee schedule defaults (fall back to global defaults)
  const scheduleDefaults = {
    startTime: employeeDefaults?.default_start_time?.slice(0, 5) || DEFAULT_ROW.startTime,
    lunchOut: employeeDefaults?.default_lunch_out?.slice(0, 5) || DEFAULT_ROW.lunchOut,
    lunchIn: employeeDefaults?.default_lunch_in?.slice(0, 5) || DEFAULT_ROW.lunchIn,
    endTime: employeeDefaults?.default_end_time?.slice(0, 5) || DEFAULT_ROW.endTime,
  };

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

    const entries = rows.map((row) => ({
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
      if (onSaved) onSaved();
    }
  }

  const isNoTime = (code) => NO_TIME_CODES.includes(code);

  const inputCls =
    'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';
  const selectCls =
    'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';
  const disabledInputCls =
    'w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-100 text-gray-400 cursor-not-allowed';

  return (
    <>
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[90px]">Day</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[120px]">Code</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[100px]">Location</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[90px]">Start</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[90px]">Lunch Out</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[90px]">Lunch In</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-[90px]">End</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase flex-1">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row, idx) => {
              const noTime = isNoTime(row.code);
              const needsNotes = NOTES_REQUIRED_CODES.includes(row.code);

              return (
                <tr key={row.date} className="hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {formatDayLabel(row.date)}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.code}
                      onChange={(e) => updateRow(idx, 'code', e.target.value)}
                      className={selectCls}
                    >
                      {CODES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
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
                      className={`${inputCls} ${needsNotes && !row.notes.trim() ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''}`}
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
        <div className="px-4 py-3 bg-red-50 border-t border-red-200">
          <ul className="text-sm text-red-700 space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Save bar */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-3">
        <button
          disabled={!canSave}
          onClick={saveWeek}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Week'}
        </button>
        {msg && (
          <div className={`flex items-center gap-1.5 text-sm ${msg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>

    {/* Code legend */}
    <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-3">
      <span><strong className="text-gray-700">REG</strong> Regular</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">WFH</strong> Work from Home</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">SICK</strong> Sick (Full Day)</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">SICK_PART</strong> Sick (Partial)</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">PTO</strong> Paid Time Off</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">APPT</strong> Appointment</span>
      <span className="text-gray-300">|</span>
      <span><strong className="text-gray-700">EARLY</strong> Left Early</span>
    </div>
    </>
  );
}
