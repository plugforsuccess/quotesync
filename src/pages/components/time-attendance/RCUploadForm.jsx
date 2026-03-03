// src/pages/components/time-attendance/RCUploadForm.jsx
// CSV upload form for RingCentral User Performance + User Status reports

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, HelpCircle, X, UserX } from 'lucide-react';
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

const MAX_ROWS = 500;
const MAX_MINUTES_PER_WEEK = 10080; // 168 hrs
const MAX_CALLS = 10000;

function clampInt(val, min, max) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(val, min, max) {
  const n = parseFloat(val);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export default function RCUploadForm({ orgId, weekStart, employeeMap, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null); // { matchedRows, unmatchedNames, skippedCount }
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);
    setWarnings([]);

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      setMsg({ type: 'error', text: 'No data rows found in CSV.' });
      return;
    }

    if (rows.length > MAX_ROWS) {
      setMsg({ type: 'error', text: `CSV has ${rows.length} rows. Maximum is ${MAX_ROWS}. Please split the file or filter to the current week's data.` });
      return;
    }

    const parseWarnings = [];

    // Parse rows into our data shape with validation bounds
    const parsed = rows
      .map((row, idx) => {
        const name = findColumn(row, COLUMN_MAPPINGS.name) || '';
        if (!name) return null;

        const totalCalls = clampInt(findColumn(row, COLUMN_MAPPINGS.total_calls) || '0', 0, MAX_CALLS);
        const inboundCalls = clampInt(findColumn(row, COLUMN_MAPPINGS.inbound_calls) || '0', 0, MAX_CALLS);
        const outboundCalls = clampInt(findColumn(row, COLUMN_MAPPINGS.outbound_calls) || '0', 0, MAX_CALLS);
        const talkTime = clampFloat(parseMinutes(findColumn(row, COLUMN_MAPPINGS.talk_time)), 0, MAX_MINUTES_PER_WEEK);
        const aht = clampFloat(parseMinutes(findColumn(row, COLUMN_MAPPINGS.avg_handle_time)), 0, 1440);
        const loggedIn = clampFloat(parseMinutes(findColumn(row, COLUMN_MAPPINGS.logged_in)), 0, MAX_MINUTES_PER_WEEK);
        const available = clampFloat(parseMinutes(findColumn(row, COLUMN_MAPPINGS.available)), 0, MAX_MINUTES_PER_WEEK);
        const offline = clampFloat(parseMinutes(findColumn(row, COLUMN_MAPPINGS.offline)), 0, MAX_MINUTES_PER_WEEK);

        // Check for unmatched employee
        const matchedId = employeeMap?.[name];
        if (!matchedId) {
          parseWarnings.push(`Row ${idx + 2}: "${name}" does not match any known employee.`);
        }

        return {
          employee_name: name,
          matched: !!matchedId,
          total_calls: totalCalls,
          inbound_calls: inboundCalls,
          outbound_calls: outboundCalls,
          talk_time_minutes: talkTime,
          avg_handle_time_minutes: aht,
          logged_in_minutes: loggedIn,
          available_minutes: available,
          offline_minutes: offline,
        };
      })
      .filter(Boolean);

    setWarnings(parseWarnings);
    setPreview(parsed);
  }

  function submitUpload() {
    if (!preview || preview.length === 0) return;

    // Filter to only matched rows — unmatched rows are skipped
    const matchedRows = preview.filter((row) => row.matched);
    const skippedCount = preview.length - matchedRows.length;

    if (matchedRows.length === 0) {
      setMsg({ type: 'error', text: 'No rows matched known employees. Please check employee names in the CSV.' });
      return;
    }

    // Show confirmation modal if some rows will be skipped
    if (skippedCount > 0) {
      const unmatchedNames = preview
        .filter((row) => !row.matched)
        .map((row) => row.employee_name);
      setConfirmModal({ matchedRows, unmatchedNames, skippedCount });
      return;
    }

    // No unmatched rows — upload directly
    doUpload(matchedRows, 0);
  }

  async function doUpload(matchedRows, skippedCount) {
    setConfirmModal(null);
    setUploading(true);
    setMsg(null);

    const { data: { user } } = await supabase.auth.getUser();

    const records = matchedRows.map((row) => {
      const matchedId = employeeMap?.[row.employee_name];

      return {
        org_id: orgId,
        employee_user_id: matchedId,
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
      const skipNote = skippedCount > 0 ? ` (${skippedCount} unmatched skipped)` : '';
      setMsg({ type: 'success', text: `${records.length} records uploaded${skipNote}.` });
      setPreview(null);
      setWarnings([]);
      if (fileRef.current) fileRef.current.value = '';
      if (onUploaded) onUploaded();

      // Fire-and-forget: trigger discrepancy detection after successful upload
      supabase.functions.invoke('detect-discrepancies', {
        body: { scope: 'upload', week_start: weekStart, org_id: orgId },
      }).catch((err) => {
        console.error('[RC_UPLOAD] Discrepancy detection failed (non-blocking):', err);
      });
    }
  }

  // Close confirmation modal on Escape key
  const handleEscKey = useCallback((e) => {
    if (e.key === 'Escape') setConfirmModal(null);
  }, []);

  useEffect(() => {
    if (confirmModal) {
      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [confirmModal, handleEscKey]);

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

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-semibold text-yellow-800 mb-1">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            {warnings.length} unmatched employee{warnings.length > 1 ? 's' : ''}
          </p>
          <ul className="text-xs text-yellow-700 space-y-0.5 max-h-32 overflow-y-auto">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <p className="text-xs text-yellow-600 mt-1">Unmatched rows will be skipped during upload. You will be asked to confirm before proceeding.</p>
        </div>
      )}

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
                  <tr key={i} className={row.matched ? 'hover:bg-gray-50' : 'bg-yellow-50/50 hover:bg-yellow-50'}>
                    <td className="px-3 py-2 text-gray-900">
                      {row.employee_name}
                      {!row.matched && <span className="ml-1 text-xs text-yellow-600" title="No matching employee found">(?)</span>}
                    </td>
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

      {/* Unmatched rows confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={() => setConfirmModal(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white rounded-lg shadow-xl">
              {/* Header */}
              <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserX className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      Unmatched Employees
                    </h3>
                  </div>
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="text-gray-400 hover:text-gray-500 transition"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600 mb-3">
                  {confirmModal.skippedCount} row{confirmModal.skippedCount > 1 ? 's' : ''} will be skipped because {confirmModal.skippedCount > 1 ? 'these employees don\u2019t' : 'this employee doesn\u2019t'} match any known employee:
                </p>
                <ul className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto mb-4">
                  {confirmModal.unmatchedNames.map((name, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-yellow-800">
                      <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{confirmModal.matchedRows.length}</span> matched row{confirmModal.matchedRows.length !== 1 ? 's' : ''} will be uploaded.
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => doUpload(confirmModal.matchedRows, confirmModal.skippedCount)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Upload Matched Only
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
