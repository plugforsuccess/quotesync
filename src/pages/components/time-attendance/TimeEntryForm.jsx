// src/pages/components/time-attendance/TimeEntryForm.jsx
// Employee time entry form with upsert on (employee_user_id, work_date)

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [code, setCodeRaw] = useState(() => {
    const wd = workDateProp || toLocalDateStr(new Date());
    const yr = parseInt(wd.slice(0, 4));
    return getFederalHolidays(yr).has(wd) ? 'HOLIDAY' : 'REG';
  });

  // Auto-switch code when workDate changes to/from a holiday
  useEffect(() => {
    if (isHoliday && code !== 'HOLIDAY') setCodeRaw('HOLIDAY');
    else if (!isHoliday && code === 'HOLIDAY') setCodeRaw('REG');
  }, [workDate, isHoliday]);

  const queryClient = useQueryClient();

  // ── Employee PTO / Sick configuration ───────────────────────────────────
  const { data: employeeRecord } = useQuery({
    queryKey: ['employee_leave_config', employeeUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('pto_days_per_year, sick_days_per_year, pto_eligible_date')
        .or(`auth_user_id.eq.${employeeUserId},id.eq.${employeeUserId}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeUserId,
    staleTime: 5 * 60 * 1000,
  });

  // ── PTO / Sick usage (current calendar year) ────────────────────────────
  const currentYear = new Date().getFullYear();

  const { data: leaveUsage } = useQuery({
    queryKey: ['leave_usage', employeeUserId, currentYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_time_entries')
        .select('code, work_date')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId)
        .gte('work_date', `${currentYear}-01-01`)
        .lte('work_date', `${currentYear}-12-31`);
      if (error) throw error;
      return {
        ptoUsed:  (data || []).filter(e => e.code === 'PTO').length,
        sickUsed: (data || []).filter(e => e.code === 'SICK').length,
      };
    },
    enabled: !!employeeUserId && !!orgId,
    staleTime: 60 * 1000,
  });

  const ptoUsed  = leaveUsage?.ptoUsed  ?? 0;
  const sickUsed = leaveUsage?.sickUsed ?? 0;
  const ptoDaysPerYear  = employeeRecord?.pto_days_per_year  ?? 10;
  const sickDaysPerYear = employeeRecord?.sick_days_per_year ?? 5;
  const ptoEligibleDate = employeeRecord?.pto_eligible_date  ?? null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const ptoEligible = !ptoEligibleDate || todayStr >= ptoEligibleDate;
  const ptoRemaining = Math.max(0, ptoDaysPerYear - ptoUsed);
  const ptoExhausted = ptoRemaining <= 0;
  const sickOverThreshold = sickUsed >= sickDaysPerYear;

  // PTO gate — blocks selection if not eligible or exhausted
  function setCode(next) {
    if (next === 'PTO') {
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
    setCodeRaw(next);
  }
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
      queryClient.invalidateQueries({ queryKey: ['leave_usage', employeeUserId, currentYear] });
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

      {/* Sick day soft warning */}
      {code === 'SICK' && sickOverThreshold && (
        <div style={{
          background: '#F59E0B11', border: '1px solid #F59E0B44',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          fontSize: 12, color: '#F59E0B',
        }}>
          ⚠ {sickUsed} sick days used in {currentYear}
          {' '}— exceeds the {sickDaysPerYear}-day advisory threshold.
          Entry will still be saved.
        </div>
      )}

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
            fontSize: 12, color: 'var(--qs-dim)',
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
            ).map((c) => {
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
