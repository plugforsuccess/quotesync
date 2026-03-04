// src/pages/components/time-attendance/RCUploadForm.jsx
// XLSX upload form for RingCentral User Performance report
// Uses SheetJS to parse the "Users" sheet from RC Analytics exports.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, HelpCircle, X, UserX } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx';

// ── Time Parsing ────────────────────────────────────────────────────────────────

/** Parse time value to minutes. Handles Excel day-fractions, HH:MM:SS, and Xh Ym. */
function parseTimedeltaMinutes(val) {
  if (!val && val !== 0) return 0;
  // SheetJS reads Excel time-formatted cells as day fractions
  // e.g., 0.003865... × 86400 = 334 seconds = 5.57 minutes
  if (typeof val === 'number' && val >= 0 && val < 1) {
    return (val * 86400) / 60;
  }
  const str = String(val).trim();
  // HH:MM:SS format
  const hms = str.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 60 + parseInt(hms[2], 10) + parseInt(hms[3], 10) / 60;
  }
  // Xh Ym format
  const hm = str.match(/(\d+)h\s*(\d+)m/i);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
  }
  // Plain number (already minutes)
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/** Parse time value to seconds. Handles Excel day-fractions and HH:MM:SS. */
function parseTimedeltaSeconds(val) {
  if (!val && val !== 0) return 0;
  // SheetJS reads Excel time-formatted cells as day fractions
  // e.g., 0.003865... × 86400 = 334 seconds
  if (typeof val === 'number' && val >= 0 && val < 1) {
    return val * 86400;
  }
  const str = String(val).trim();
  const hms = str.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// ── Column Mapping ──────────────────────────────────────────────────────────────
// RC XLSX column headers contain special characters (#, %, trailing spaces).
// We normalize headers to lowercase trimmed strings and match against aliases.

const COLUMN_MAPPINGS = {
  name:                    ['name', 'user name', 'user', 'agent name', 'agent', 'full name', 'employee'],
  total_calls:             ['total calls', 'calls', 'total'],
  avg_calls_per_day:       ['avg. calls/day', 'avg calls/day', 'avg. calls per day', 'avg calls per day'],
  inbound_calls:           ['# inbound', 'inbound', 'inbound calls', 'calls received'],
  outbound_calls:          ['# outbound', 'outbound', 'outbound calls', 'calls made'],
  answered_calls:          ['# answered', '# answered (in)', 'answered', 'answered calls'],
  missed_calls:            ['# missed (w/vm)', '# missed', 'missed calls', 'missed (w/vm)', 'missed'],
  missed_pct:              ['% missed (w/vm)', '% missed', 'missed %', 'missed pct'],
  transfers:               ['# transfers', 'transfers'],
  transfer_pct:            ['% transferred', 'transfer %', 'transferred %', 'transfer pct'],
  voicemails:              ['# voicemail', 'voicemail', 'voicemails'],
  hold_count:              ['# holds', 'holds', 'hold count'],
  avg_handle_time:         ['avg. handle time', 'avg handle time', 'average handle time', 'aht'],
  total_handle_time:       ['total handle time'],
  avg_handle_time_in:      ['avg. handle time (in)', 'avg handle time (in)', 'avg. handle time (inbound)'],
  avg_handle_time_out:     ['avg. handle time (out)', 'avg handle time (out)', 'avg. handle time (outbound)'],
  avg_hold_time:           ['avg. hold time', 'avg hold time', 'average hold time'],
  avg_speed_of_answer:     ['avg. speed of answer', 'avg speed of answer', 'speed of answer', 'asa'],
  total_call_sessions:     ['total call sessions', 'call sessions'],
};

function normalizeHeader(h) {
  return String(h).trim().toLowerCase();
}

function findColumn(row, normalizedKeys, aliases) {
  for (const alias of aliases) {
    const match = normalizedKeys.find((k) => k === alias);
    if (match !== undefined) {
      // Find original key that normalizes to this
      const originalKey = Object.keys(row).find((k) => normalizeHeader(k) === match);
      if (originalKey !== undefined) return row[originalKey];
    }
  }
  return null;
}

// ── Validation ──────────────────────────────────────────────────────────────────

const MAX_ROWS = 500;
const MAX_MINUTES_PER_WEEK = 10080;
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

function parsePct(val) {
  if (!val) return 0;
  const str = String(val).replace('%', '').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function RCUploadForm({ orgId, weekStart, employeeMap, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);
    setWarnings([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // Target the "Users" sheet; fall back to first sheet if not found
      const sheetName = workbook.SheetNames.find(
        (s) => s.toLowerCase() === 'users'
      ) || workbook.SheetNames[0];

      if (!sheetName) {
        setMsg({ type: 'error', text: 'No sheets found in the XLSX file.' });
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        setMsg({ type: 'error', text: `No data rows found in sheet "${sheetName}".` });
        return;
      }

      if (rows.length > MAX_ROWS) {
        setMsg({ type: 'error', text: `Sheet has ${rows.length} rows. Maximum is ${MAX_ROWS}.` });
        return;
      }

      const parseWarnings = [];

      const parsed = rows
        .map((row, idx) => {
          const nKeys = Object.keys(row).map(normalizeHeader);
          const rawName = findColumn(row, nKeys, COLUMN_MAPPINGS.name) || '';
          if (!rawName) return null;
          const name = String(rawName).trim();

          const matchedId = employeeMap?.[name.toLowerCase()];
          if (!matchedId) {
            parseWarnings.push(`Row ${idx + 2}: "${name}" does not match any known employee.`);
          }

          return {
            employee_name: name,
            matched: !!matchedId,
            total_calls:                 clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.total_calls) || '0', 0, MAX_CALLS),
            avg_calls_per_day:           clampFloat(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_calls_per_day) || '0', 0, 2000),
            inbound_calls:               clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.inbound_calls) || '0', 0, MAX_CALLS),
            outbound_calls:              clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.outbound_calls) || '0', 0, MAX_CALLS),
            answered_calls:              clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.answered_calls) || '0', 0, MAX_CALLS),
            missed_calls:                clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.missed_calls) || '0', 0, MAX_CALLS),
            missed_pct:                  parsePct(findColumn(row, nKeys, COLUMN_MAPPINGS.missed_pct)),
            transfers:                   clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.transfers) || '0', 0, MAX_CALLS),
            transfer_pct:                parsePct(findColumn(row, nKeys, COLUMN_MAPPINGS.transfer_pct)),
            voicemails:                  clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.voicemails) || '0', 0, MAX_CALLS),
            hold_count:                  clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.hold_count) || '0', 0, MAX_CALLS),
            avg_handle_time_minutes:     clampFloat(parseTimedeltaMinutes(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_handle_time)), 0, 1440),
            total_handle_time_minutes:   clampFloat(parseTimedeltaMinutes(findColumn(row, nKeys, COLUMN_MAPPINGS.total_handle_time)), 0, MAX_MINUTES_PER_WEEK),
            avg_handle_time_in_minutes:  clampFloat(parseTimedeltaMinutes(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_handle_time_in)), 0, 1440),
            avg_handle_time_out_minutes: clampFloat(parseTimedeltaMinutes(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_handle_time_out)), 0, 1440),
            avg_hold_time_minutes:       clampFloat(parseTimedeltaMinutes(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_hold_time)), 0, 1440),
            avg_speed_of_answer_seconds: clampFloat(parseTimedeltaSeconds(findColumn(row, nKeys, COLUMN_MAPPINGS.avg_speed_of_answer)), 0, 86400),
            total_call_sessions:         clampInt(findColumn(row, nKeys, COLUMN_MAPPINGS.total_call_sessions) || '0', 0, MAX_CALLS),
          };
        })
        .filter(Boolean);

      setWarnings(parseWarnings);
      setPreview(parsed);
    } catch (err) {
      setMsg({ type: 'error', text: `Failed to parse file: ${err.message}` });
    }
  }

  function submitUpload() {
    if (!preview || preview.length === 0) return;

    const matchedRows = preview.filter((row) => row.matched);
    const skippedCount = preview.length - matchedRows.length;

    if (matchedRows.length === 0) {
      setMsg({ type: 'error', text: 'No rows matched known employees. Please check employee names in the file.' });
      return;
    }

    if (skippedCount > 0) {
      const unmatchedNames = preview
        .filter((row) => !row.matched)
        .map((row) => row.employee_name);
      setConfirmModal({ matchedRows, unmatchedNames, skippedCount });
      return;
    }

    doUpload(matchedRows, 0);
  }

  async function doUpload(matchedRows, skippedCount) {
    setConfirmModal(null);
    setUploading(true);
    setMsg(null);

    const { data: { user } } = await supabase.auth.getUser();

    const round2 = (v) => Math.round(v * 100) / 100;

    const records = matchedRows.map((row) => ({
      org_id: orgId,
      employee_user_id: employeeMap?.[row.employee_name.toLowerCase()],
      employee_name: row.employee_name,
      week_start: weekStart,
      total_calls: row.total_calls,
      avg_calls_per_day: round2(row.avg_calls_per_day),
      inbound_calls: row.inbound_calls,
      outbound_calls: row.outbound_calls,
      answered_calls: row.answered_calls,
      missed_calls: row.missed_calls,
      missed_pct: round2(row.missed_pct),
      transfers: row.transfers,
      transfer_pct: round2(row.transfer_pct),
      voicemails: row.voicemails,
      hold_count: row.hold_count,
      avg_handle_time_minutes: round2(row.avg_handle_time_minutes),
      total_handle_time_minutes: round2(row.total_handle_time_minutes),
      avg_handle_time_in_minutes: round2(row.avg_handle_time_in_minutes),
      avg_handle_time_out_minutes: round2(row.avg_handle_time_out_minutes),
      avg_hold_time_minutes: round2(row.avg_hold_time_minutes),
      avg_speed_of_answer_seconds: round2(row.avg_speed_of_answer_seconds),
      total_call_sessions: row.total_call_sessions,
      uploaded_by: user?.id,
    }));

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
            <p className="text-sm text-gray-500">XLSX export from User Performance report</p>
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
          <p className="font-medium mb-2">How to export from RingCentral:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700 mb-3">
            <li>Go to RingCentral Analytics &rarr; User Performance</li>
            <li>Set date range to the target week (Mon&ndash;Fri)</li>
            <li>Export as XLSX</li>
          </ol>
          <p className="font-medium mb-2">Expected columns from the "Users" sheet:</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>Name</strong> &mdash; employee matching</li>
            <li><strong>Total Calls</strong>, <strong># Inbound</strong>, <strong># Outbound</strong>, <strong># Answered</strong></li>
            <li><strong># Missed (w/VM)</strong>, <strong># Transfers</strong>, <strong># Holds</strong></li>
            <li><strong>Avg. Handle Time</strong>, <strong>Total Handle Time</strong> (HH:MM:SS)</li>
            <li><strong>Avg. Hold Time</strong>, <strong>Avg. Speed of Answer</strong> (HH:MM:SS)</li>
          </ul>
          <p className="mt-2 text-xs">Time columns are parsed from HH:MM:SS format automatically.</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          Choose XLSX
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
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
          <p className="text-xs text-yellow-600 mt-1">Unmatched rows will be skipped during upload.</p>
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
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Answered</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Missed</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">AHT</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">ASA</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Hold</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Xfer %</th>
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
                    <td className="px-3 py-2 text-right text-gray-600">{row.answered_calls}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.missed_calls}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.avg_handle_time_minutes.toFixed(1)}m</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.avg_speed_of_answer_seconds.toFixed(0)}s</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.avg_hold_time_minutes.toFixed(1)}m</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.transfer_pct.toFixed(1)}%</td>
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
              <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserX className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Unmatched Employees</h3>
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
