// src/pages/components/time-attendance/CallLogUploadForm.jsx
// Upload form for RingCentral Call Log exports (XLSX or CSV).
// Parses individual call records and upserts to rc_call_log table.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Phone, AlertCircle, CheckCircle, HelpCircle, X, UserX } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx';

// ── Time Parsing ────────────────────────────────────────────────────────────────

function parseTimedeltaSeconds(val) {
  if (!val && val !== 0) return 0;
  if (typeof val === 'number' && val >= 0 && val < 1) {
    return Math.round(val * 86400);
  }
  const str = String(val).trim();
  const hms = str.match(/^(\d+):(\d+):(\d+)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

// ── Agent Name Extraction ───────────────────────────────────────────────────────

function extractAgentName(rawName) {
  if (!rawName) return null;
  let name = rawName
    .replace(/\s*\(\d{3}\)\s*\d{3}-?\d{4}\s*$/, '')   // (770) 786-1616
    .replace(/\s*\+\d[\d\s]+$/, '')                      // +244 49102
    .trim();
  // Strip queue prefix: "0C2667 English Sales - CALLER NAME" → "CALLER NAME"
  const queueDash = name.indexOf(' - ');
  if (queueDash > 0 && /^\w+\s+(English|Spanish)\s+(Sales|Service)/i.test(name)) {
    name = name.substring(queueDash + 3).trim();
  }
  return name || null;
}

function resolveAgent(row) {
  const direction = row['Call Direction'] || row.call_direction || '';
  if (direction === 'Outbound') {
    return extractAgentName(row['From Name'] || row.from_name);
  } else {
    return extractAgentName(row['To Name'] || row.to_name);
  }
}

// ── Queue Type ──────────────────────────────────────────────────────────────────

function deriveQueueType(queue) {
  if (!queue) return null;
  const lower = queue.toLowerCase();
  if (lower.includes('sales')) return 'sales';
  if (lower.includes('service')) return 'service';
  return 'other';
}

function cleanQueueName(queue) {
  if (!queue) return null;
  return queue.replace(/^\w+\s+/, '');
}

// ── Date Helpers ────────────────────────────────────────────────────────────────

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── CSV Parser ──────────────────────────────────────────────────────────────────

function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

// ── Row Transformation ──────────────────────────────────────────────────────────

function transformRow(row, employeeMap, orgId) {
  const agentName = resolveAgent(row);
  const matchedId = agentName ? employeeMap[agentName.toLowerCase()] : null;

  const callStartStr = row['Call Start Time'] || row.call_start_time || '';
  const callStart = new Date(callStartStr);
  if (isNaN(callStart.getTime())) return null;

  const callDate = toLocalDateStr(callStart);
  const queue = row.Queue || row.queue || null;
  const cleanQueue = cleanQueueName(queue);

  const direction = row['Call Direction'] || row.call_direction || '';
  const result = row.Result || row.result || '';
  if (!direction || !result) return null;

  return {
    org_id: orgId,
    employee_user_id: matchedId,
    employee_name: agentName || 'Unknown',
    session_id: row['Session Id'] || row.session_id || null,
    call_date: callDate,
    call_start_time: callStart.toISOString(),
    call_direction: direction,
    call_result: result,
    call_length_seconds: parseTimedeltaSeconds(row['Call Length'] || row.call_length),
    handle_time_seconds: parseTimedeltaSeconds(row['Handle Time'] || row.handle_time) || null,
    from_name: row['From Name'] || row.from_name || null,
    from_number: row['From Number'] || row.from_number || null,
    to_name: row['To Name'] || row.to_name || null,
    to_number: row['To Number'] || row.to_number || null,
    queue: cleanQueue,
    queue_type: deriveQueueType(queue),
    matched: !!matchedId,
    // For preview display
    _time: formatTime(callStart),
    _duration: formatDuration(parseTimedeltaSeconds(row['Call Length'] || row.call_length)),
  };
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function CallLogUploadForm({ orgId, weekStart, employeeMap, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);

    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      let rows;

      if (isCSV) {
        const text = await file.text();
        rows = parseCSVText(text);
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames.find(
          (s) => s.toLowerCase() === 'calls'
        ) || workbook.SheetNames[workbook.SheetNames.length - 1];

        if (!sheetName) {
          setMsg({ type: 'error', text: 'No sheets found in the XLSX file.' });
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      }

      if (rows.length === 0) {
        setMsg({ type: 'error', text: 'No data rows found in the file.' });
        return;
      }

      if (rows.length > 5000) {
        setMsg({ type: 'error', text: `File has ${rows.length} rows. Maximum is 5,000.` });
        return;
      }

      const parsed = rows
        .map((row) => transformRow(row, employeeMap || {}, orgId))
        .filter(Boolean);

      if (parsed.length === 0) {
        setMsg({ type: 'error', text: 'No valid call records found. Check the file format.' });
        return;
      }

      setPreview(parsed);
    } catch (err) {
      setMsg({ type: 'error', text: `Failed to parse file: ${err.message}` });
    }
  }

  // Compute summary stats from preview
  const summary = preview ? (() => {
    const outbound = preview.filter((r) => r.call_direction === 'Outbound').length;
    const inbound = preview.filter((r) => r.call_direction === 'Inbound').length;
    const answered = preview.filter((r) => r.call_result === 'Answered').length;
    const missed = preview.filter((r) => r.call_result === 'VM/Missed').length;
    const matched = new Set(preview.filter((r) => r.matched).map((r) => r.employee_name)).size;
    const unmatched = new Set(preview.filter((r) => !r.matched).map((r) => r.employee_name)).size;
    const agents = new Set(preview.map((r) => r.employee_name)).size;
    const dateRange = preview.reduce((acc, r) => {
      if (!acc.min || r.call_date < acc.min) acc.min = r.call_date;
      if (!acc.max || r.call_date > acc.max) acc.max = r.call_date;
      return acc;
    }, { min: null, max: null });
    return { outbound, inbound, answered, missed, matched, unmatched, agents, dateRange };
  })() : null;

  function submitUpload() {
    if (!preview || preview.length === 0) return;

    const matchedRows = preview.filter((r) => r.matched);
    const unmatchedNames = [...new Set(preview.filter((r) => !r.matched).map((r) => r.employee_name))];

    if (matchedRows.length === 0) {
      setMsg({ type: 'error', text: 'No calls matched known employees. Check employee names.' });
      return;
    }

    if (unmatchedNames.length > 0) {
      setConfirmModal({ matchedRows, unmatchedNames, skippedCount: preview.length - matchedRows.length });
      return;
    }

    doUpload(matchedRows, 0);
  }

  async function doUpload(matchedRows, skippedCount) {
    setConfirmModal(null);
    setUploading(true);
    setMsg(null);

    const { data: { user } } = await supabase.auth.getUser();

    // Strip preview-only fields and add uploaded_by
    const records = matchedRows.map(({ matched, _time, _duration, ...row }) => ({
      ...row,
      uploaded_by: user?.id,
    }));

    // Batch upsert in chunks of 500
    const BATCH_SIZE = 500;
    let totalUploaded = 0;
    let uploadError = null;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('rc_call_log').upsert(batch, {
        onConflict: 'org_id,employee_user_id,call_start_time,call_direction,call_result',
        ignoreDuplicates: true,
      });
      if (error) {
        uploadError = error;
        break;
      }
      totalUploaded += batch.length;
    }

    setUploading(false);

    if (uploadError) {
      setMsg({ type: 'error', text: `Upload failed: ${uploadError.message}` });
    } else {
      const skipNote = skippedCount > 0 ? ` (${skippedCount} unmatched skipped)` : '';
      setMsg({ type: 'success', text: `${totalUploaded} call records uploaded${skipNote}.` });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      if (onUploaded) onUploaded();
    }
  }

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
          <Phone className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Daily Call Log Upload</h3>
            <p className="text-sm text-gray-500">
              Upload the RingCentral Call Log export (XLSX or CSV). Primary data source — upload daily at end of business.
            </p>
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
          <p className="font-medium mb-2">How to export the Call Log from RingCentral:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700 mb-3">
            <li>Go to RingCentral Analytics &rarr; Performance Reports &rarr; Calls</li>
            <li>Set the date range to the target day or week</li>
            <li>Export as XLSX or CSV</li>
          </ol>
          <p className="font-medium mb-2">Expected columns (from the "Calls" sheet):</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>From Name</strong>, <strong>To Name</strong> &mdash; agent identification</li>
            <li><strong>Call Direction</strong> &mdash; Inbound or Outbound</li>
            <li><strong>Result</strong> &mdash; Connected, Answered, or VM/Missed</li>
            <li><strong>Call Length</strong>, <strong>Handle Time</strong> &mdash; HH:MM:SS</li>
            <li><strong>Queue</strong> &mdash; Sales or Service queue name</li>
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          Choose File
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
          />
        </label>
        {summary?.dateRange?.min && (
          <span className="text-sm text-gray-500">
            Date range: {summary.dateRange.min} &mdash; {summary.dateRange.max}
          </span>
        )}
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && summary && (
        <div className="mt-4">
          <div className="mb-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700">
              {preview.length} calls found: {summary.outbound} outbound, {summary.inbound} inbound
              ({summary.answered} answered, {summary.missed} missed).
              {' '}{summary.matched} agent{summary.matched !== 1 ? 's' : ''} matched
              {summary.unmatched > 0 && (
                <span className="text-yellow-600">, {summary.unmatched} unmatched</span>
              )}
              .
            </p>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Agent</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Direction</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Result</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Duration</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Queue</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.slice(0, 100).map((row, i) => (
                  <tr key={i} className={row.matched ? 'hover:bg-gray-50' : 'bg-yellow-50/50 hover:bg-yellow-50'}>
                    <td className="px-3 py-2 text-gray-900">
                      {row.employee_name}
                      {!row.matched && <span className="ml-1 text-xs text-yellow-600" title="No matching employee found">(?)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.call_direction === 'Outbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {row.call_direction === 'Outbound' ? 'Out' : 'In'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${
                        row.call_result === 'VM/Missed' ? 'text-red-600' :
                        row.call_result === 'Connected' ? 'text-blue-600' : 'text-green-600'
                      }`}>
                        {row.call_result === 'VM/Missed' ? 'Missed' : row.call_result}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600 font-mono">{row._duration}</td>
                    <td className="px-3 py-2 text-gray-600">{row.queue || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row._time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 100 && (
            <p className="text-xs text-gray-500 mt-1">Showing first 100 of {preview.length} rows.</p>
          )}

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
                  {confirmModal.skippedCount} call{confirmModal.skippedCount > 1 ? 's' : ''} will be skipped
                  because {confirmModal.unmatchedNames.length > 1 ? 'these agents don\u2019t' : 'this agent doesn\u2019t'} match any known employee:
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
                  <span className="font-medium text-gray-900">{confirmModal.matchedRows.length}</span> matched call{confirmModal.matchedRows.length !== 1 ? 's' : ''} will be uploaded.
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
