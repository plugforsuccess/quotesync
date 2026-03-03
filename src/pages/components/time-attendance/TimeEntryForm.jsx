// src/pages/components/time-attendance/TimeEntryForm.jsx
// Employee time entry form with upsert on (employee_user_id, work_date)

import { useMemo, useState } from 'react';
import { Clock, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CODES = [
  { value: 'REG', label: 'Regular' },
  { value: 'WFH', label: 'Work from Home' },
  { value: 'SICK', label: 'Sick (Full Day)' },
  { value: 'SICK_PART', label: 'Sick (Partial)' },
  { value: 'PTO', label: 'PTO' },
  { value: 'APPT', label: 'Appointment' },
  { value: 'EARLY', label: 'Left Early' },
];

const LOCATIONS = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'WFH', label: 'WFH' },
];

// Codes that don't require time fields
const NO_TIME_CODES = ['PTO', 'SICK'];
// Codes that require notes
const NOTES_REQUIRED_CODES = ['WFH', 'SICK_PART', 'APPT', 'EARLY'];

function toMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export default function TimeEntryForm({ orgId, employeeUserId, employeeName, onSaved }) {
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const weekStart = useMemo(() => toMonday(new Date(workDate)), [workDate]);

  const [location, setLocation] = useState('OFFICE');
  const [code, setCode] = useState('REG');
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
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-6 h-6 text-blue-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Time Entry</h3>
          <p className="text-sm text-gray-500">{employeeName} &middot; Week of {weekStart}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Work Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {LOCATIONS.map((loc) => (
              <option key={loc.value} value={loc.value}>{loc.label}</option>
            ))}
          </select>
        </div>

        {/* Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entry Code</label>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {CODES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Unpaid Break */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unpaid Break (min)</label>
          <input
            type="number"
            min={0}
            value={unpaidBreakMinutes}
            onChange={(e) => setUnpaidBreakMinutes(parseInt(e.target.value || '0', 10))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Start Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Time {timesRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* End Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Time {timesRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Lunch Out */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lunch Out</label>
          <input
            type="time"
            value={lunchOut}
            onChange={(e) => setLunchOut(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Lunch In */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lunch In</label>
          <input
            type="time"
            value={lunchIn}
            onChange={(e) => setLunchIn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes {notesRequired ? <span className="text-red-500">(required)</span> : '(optional)'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder={notesRequired ? 'Please provide details for this entry...' : 'Optional notes...'}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={!canSave || saving}
          onClick={saveEntry}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Entry'}
        </button>
        {msg && (
          <div className={`flex items-center gap-1.5 text-sm ${msg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
