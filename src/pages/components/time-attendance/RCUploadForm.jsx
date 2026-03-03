// src/pages/components/time-attendance/RCUploadForm.jsx
// CSV upload form for RingCentral User Performance + User Status reports

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

function toMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function parseMinutes(str) {
  if (!str) return 0;
  // Handle "HH:MM:SS" format
  const hms = str.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 60 + parseInt(hms[2], 10) + parseInt(hms[3], 10) / 60;
  }
  // Handle "Xh Ym" format
  const hm = str.match(/(\d+)h\s*(\d+)m/i);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  }
  // Try plain number (already minutes)
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Map common column names to our schema fields
const COLUMN_MAPPINGS = {
  // User/Name
  name: ['user name', 'user', 'name', 'agent name', 'agent', 'full name', 'employee'],
  // Calls
  total_calls: ['total calls', 'calls', 'total'],
  inbound_calls: ['inbound calls', 'inbound', 'calls received', 'received'],
  outbound_calls: ['outbound calls', 'outbound', 'calls made', 'made'],
  // Talk time
  talk_time: ['talk time', 'talk duration', 'total talk time', 'call time'],
  avg_handle_time: ['avg handle time', 'average handle time', 'aht', 'avg talk time'],
  // Status
  logged_in: ['logged in time', 'logged in', 'login time', 'total logged in', 'online time'],
  available: ['available time', 'available', 'total available'],
  offline: ['offline time', 'offline', 'total offline'],
};

function findColumn(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const match = keys.find((k) => k.toLowerCase() === alias);
    if (match) return row[match];
  }
  return null;
}

export default function RCUploadForm({ orgId, weekStart, employeeMap, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      setMsg({ type: 'error', text: 'No data rows found in CSV.' });
      return;
    }

    // Parse rows into our data shape
    const parsed = rows
      .map((row) => {
        const name = findColumn(row, COLUMN_MAPPINGS.name) || '';
        if (!name) return null;

        return {
          employee_name: name,
          total_calls: parseInt(findColumn(row, COLUMN_MAPPINGS.total_calls) || '0', 10),
          inbound_calls: parseInt(findColumn(row, COLUMN_MAPPINGS.inbound_calls) || '0', 10),
          outbound_calls: parseInt(findColumn(row, COLUMN_MAPPINGS.outbound_calls) || '0', 10),
          talk_time_minutes: parseMinutes(findColumn(row, COLUMN_MAPPINGS.talk_time)),
          avg_handle_time_minutes: parseMinutes(findColumn(row, COLUMN_MAPPINGS.avg_handle_time)),
          logged_in_minutes: parseMinutes(findColumn(row, COLUMN_MAPPINGS.logged_in)),
          available_minutes: parseMinutes(findColumn(row, COLUMN_MAPPINGS.available)),
          offline_minutes: parseMinutes(findColumn(row, COLUMN_MAPPINGS.offline)),
        };
      })
      .filter(Boolean);

    setPreview(parsed);
  }

  async function submitUpload() {
    if (!preview || preview.length === 0) return;
    setUploading(true);
    setMsg(null);

    const { data: { user } } = await supabase.auth.getUser();

    const records = preview.map((row) => {
      // Try to match to an employee user ID from the employee map
      const matchedId = employeeMap?.[row.employee_name] || null;

      return {
        org_id: orgId,
        employee_user_id: matchedId || '00000000-0000-0000-0000-000000000000',
        employee_name: row.employee_name,
        week_start: weekStart,
        total_calls: row.total_calls,
        inbound_calls: row.inbound_calls,
        outbound_calls: row.outbound_calls,
        talk_time_minutes: Math.round(row.talk_time_minutes * 100) / 100,
        avg_handle_time_minutes: Math.round(row.avg_handle_time_minutes * 100) / 100,
        logged_in_minutes: Math.round(row.logged_in_minutes * 100) / 100,
        available_minutes: Math.round(row.available_minutes * 100) / 100,
        offline_minutes: Math.round(row.offline_minutes * 100) / 100,
        uploaded_by: user?.id,
      };
    });

    const { error } = await supabase.from('rc_performance_data').upsert(records, {
      onConflict: 'employee_user_id,week_start',
    });

    setUploading(false);

    if (error) {
      setMsg({ type: 'error', text: `Upload failed: ${error.message}` });
    } else {
      setMsg({ type: 'success', text: `${records.length} records uploaded.` });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      if (onUploaded) onUploaded();
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upload RingCentral Data</h3>
            <p className="text-sm text-gray-500">CSV export from User Performance or User Status reports</p>
          </div>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="p-2 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {showHelp && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-2">Expected CSV columns:</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>User Name</strong> (or Name, Agent Name)</li>
            <li><strong>Total Calls</strong>, <strong>Inbound Calls</strong>, <strong>Outbound Calls</strong></li>
            <li><strong>Talk Time</strong> (HH:MM:SS or Xh Ym format)</li>
            <li><strong>Avg Handle Time</strong></li>
            <li><strong>Logged In Time</strong>, <strong>Available Time</strong>, <strong>Offline Time</strong></li>
          </ul>
          <p className="mt-2">Time values can be in HH:MM:SS, "Xh Ym", or minutes format.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          Choose CSV
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFile}
            className="hidden"
          />
        </label>
        <span className="text-sm text-gray-500">Week: {weekStart}</span>
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview ({preview.length} rows):</p>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">In</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Out</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Talk (min)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">AHT (min)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Logged In</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Available</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Offline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{row.employee_name}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.total_calls}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.inbound_calls}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.outbound_calls}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.talk_time_minutes.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.avg_handle_time_minutes.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.logged_in_minutes.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.available_minutes.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.offline_minutes.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={submitUpload}
              disabled={uploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
            <button
              onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="px-4 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`mt-3 flex items-center gap-1.5 text-sm ${msg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
          {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
