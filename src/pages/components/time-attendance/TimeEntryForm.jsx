// src/pages/components/time-attendance/TimeEntryForm.jsx
// Employee time entry form with upsert on (employee_user_id, work_date)

import { useMemo, useState, useEffect } from 'react';
import { Clock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getFederalHolidays, getHolidayLabel } from '../../../lib/federalHolidays';

const CODES = [
  { value: 'REG', label: 'Regular' },
  { value: 'WFH', label: 'Work from Home' },
  { value: 'SICK', label: 'Sick (Full Day)' },
  { value: 'SICK_PART', label: 'Sick (Partial)' },
  { value: 'PTO', label: 'PTO' },
  { value: 'APPT', label: 'Appointment' },
  { value: 'EARLY', label: 'Left Early' },
  { value: 'HOLIDAY', label: 'Federal Holiday' },
];

const LOCATIONS = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'WFH', label: 'WFH' },
];

// Codes that don't require time fields
const NO_TIME_CODES = ['PTO', 'SICK', 'HOLIDAY'];
// Codes that require notes
const NOTES_REQUIRED_CODES = ['WFH', 'SICK_PART', 'APPT', 'EARLY'];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonday(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return toLocalDateStr(date);
}

export default function TimeEntryForm({ orgId, employeeUserId, employeeName, onSaved, workDate: workDateProp }) {
  const [workDate, setWorkDate] = useState(() => workDateProp || toLocalDateStr(new Date()));
  const weekStart = useMemo(() => toMonday(workDate), [workDate]);

  const isHoliday = useMemo(() => {
    if (!workDate) return false;
    const year = parseInt(workDate.slice(0, 4));
    return getFederalHolidays(year).has(workDate);
  }, [workDate]);

  const holidayLabel = useMemo(() => {
    if (!isHoliday || !workDate) return null;
    return getHolidayLabel(workDate);
  }, [isHoliday, workDate]);

  const isWeekend = useMemo(() => {
    if (!workDate) return false;
    const dow = new Date(workDate + 'T00:00:00').getDay();
    return dow === 0 || dow === 6;
  }, [workDate]);

  const isBlocked = isHoliday || isWeekend;

  const [location, setLocation] = useState('OFFICE');
  const [code, setCode] = useState(() => {
    const wd = workDateProp || toLocalDateStr(new Date());
    const yr = parseInt(wd.slice(0, 4));
    return getFederalHolidays(yr).has(wd) ? 'HOLIDAY' : 'REG';
  });

  // Auto-switch code when workDate changes to/from a holiday
  useEffect(() => {
    if (isHoliday && code !== 'HOLIDAY') setCode('HOLIDAY');
    else if (!isHoliday && code === 'HOLIDAY') setCode('REG');
  }, [workDate, isHoliday]);
  const [startTime, setStartTime] = useState('');
  const [lunchOut, setLunchOut] = useState('');
  const [lunchIn, setLunchIn] = useState('');
  const [endTime, setEndTime] = useState('');
  const [unpaidBreakMinutes, setUnpaidBreakMinutes] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const notesRequired = NOTES_REQUIRED_CODES.includes(code);
  const timesRequired = !NO_TIME_CODES.includes(code);

  const canSave =
    !isBlocked &&
    workDate &&
    location &&
    code &&
    (!notesRequired || notes.trim().length > 0) &&
    (!timesRequired || (startTime && endTime));

  async function saveEntry() {
    setSaving(true);
    setMsg(null);

    const payload = {
      org_id: orgId,
      employee_user_id: employeeUserId,
      week_start: weekStart,
      work_date: workDate,
      location,
      code,
      start_time: startTime || null,
      lunch_out: lunchOut || null,
      lunch_in: lunchIn || null,
      end_time: endTime || null,
      unpaid_break_minutes: unpaidBreakMinutes || 0,
      notes: notes.trim() || null,
    };

    const { error } = await supabase.from('employee_time_entries').upsert(payload, {
      onConflict: 'employee_user_id,work_date',
    });

    setSaving(false);

    if (error) {
      setMsg({ type: 'error', text: `Error: ${error.message}` });
    } else {
      setMsg({ type: 'success', text: 'Time entry saved.' });
      if (onSaved) onSaved();
    }
  }

  return (
    <div className="bg-qs-card rounded-lg border border-qs-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-6 h-6 text-primary-600" />
        <div>
          <h3 className="text-lg font-semibold text-qs-bright">Time Entry</h3>
          <p className="text-sm text-qs-subtle">{employeeName} &middot; Week of {weekStart}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Work Date */}
        <div>
          <label className="dark-label">Work Date</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="dark-input"
          />
        </div>

        {isWeekend && (
          <div className="sm:col-span-2" style={{
            background: '#94A3B811', border: '1px solid #94A3B833',
            borderRadius: 6, padding: '8px 12px',
            fontSize: 12, color: '#94A3B8',
          }}>
            ⚠ Weekends are not working days — no entry required.
          </div>
        )}

        {isHoliday && (
          <div className="sm:col-span-2" style={{
            background: '#3B82F611', border: '1px solid #3B82F633',
            borderRadius: 6, padding: '8px 12px',
            fontSize: 12, color: '#3B82F6', fontWeight: 500,
          }}>
            🏛 {holidayLabel} — Agency closed. No entry required.
          </div>
        )}

        {/* Location */}
        <div>
          <label className="dark-label">Location</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="dark-input"
          >
            {LOCATIONS.map((loc) => (
              <option key={loc.value} value={loc.value}>{loc.label}</option>
            ))}
          </select>
        </div>

        {/* Code */}
        <div>
          <label className="dark-label">Entry Code</label>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="dark-input"
            disabled={isHoliday}
          >
            {(isHoliday
              ? [{ value: 'HOLIDAY', label: 'Federal Holiday' }]
              : CODES
            ).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Unpaid Break */}
        <div>
          <label className="dark-label">Unpaid Break (min)</label>
          <input
            type="number"
            min={0}
            value={unpaidBreakMinutes}
            onChange={(e) => setUnpaidBreakMinutes(parseInt(e.target.value || '0', 10))}
            className="dark-input"
          />
        </div>

        {/* Start Time */}
        <div>
          <label className="dark-label">
            Start Time {timesRequired && <span className="text-red-400">*</span>}
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="dark-input"
          />
        </div>

        {/* End Time */}
        <div>
          <label className="dark-label">
            End Time {timesRequired && <span className="text-red-400">*</span>}
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="dark-input"
          />
        </div>

        {/* Lunch Out */}
        <div>
          <label className="dark-label">Lunch Out</label>
          <input
            type="time"
            value={lunchOut}
            onChange={(e) => setLunchOut(e.target.value)}
            className="dark-input"
          />
        </div>

        {/* Lunch In */}
        <div>
          <label className="dark-label">Lunch In</label>
          <input
            type="time"
            value={lunchIn}
            onChange={(e) => setLunchIn(e.target.value)}
            className="dark-input"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="dark-label">
            Notes {notesRequired ? <span className="text-red-400">(required)</span> : '(optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="dark-input resize-none"
            placeholder={notesRequired ? 'Please provide details for this entry...' : 'Optional notes...'}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={!canSave || saving}
          onClick={saveEntry}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Entry'}
        </button>
        {msg && (
          <div className={`flex items-center gap-1.5 text-sm ${msg.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
