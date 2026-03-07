// src/pages/components/time-attendance/QueueUploadForm.jsx
// Upload form for RingCentral Queues report (XLSX).
// Parses per-queue daily metrics from the "Queues" sheet and upserts to rc_queue_data.
// Captures abandoned calls that never reach an agent — invisible in the Call Log.

import { useState, useRef } from 'react';
import { Upload, BarChart3, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
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

// ── Queue Helpers ───────────────────────────────────────────────────────────────

function deriveQueueType(queueName) {
  if (!queueName) return null;
  const lower = queueName.toLowerCase();
  if (lower.includes('sales')) return 'sales';
  if (lower.includes('service')) return 'service';
  if (lower.includes('ld')) return 'ld';
  return 'other';
}

function cleanQueueName(name) {
  if (!name) return name;
  return name.replace(/^\w+\s+/, '');
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Abandon Rate Styling ────────────────────────────────────────────────────────

function abandonRateColor(rate, inbound) {
  if (inbound === 0) return 'text-gray-400';
  if (rate >= 25) return 'text-red-600';
  if (rate >= 10) return 'text-amber-600';
  return 'text-green-600';
}

function abandonRateIndicator(rate, inbound) {
  if (inbound === 0) return null;
  if (rate >= 25) return <span className="text-red-500 ml-1" title="Critical abandon rate">&#x1F534;</span>;
  return null;
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function QueueUploadForm({ orgId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detectedDate, setDetectedDate] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);
    setDetectedDate(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      // 1. Extract date from Filters sheet
      const filtersSheet = workbook.SheetNames.find(
        (s) => s.toLowerCase() === 'filters'
      );
      let reportDate = null;
      if (filtersSheet) {
        const filtersRows = XLSX.utils.sheet_to_json(
          workbook.Sheets[filtersSheet], { defval: '' }
        );
        if (filtersRows.length > 0) {
          const fromTime = filtersRows[0]['From Time'];
          if (fromTime) {
            const parsed = new Date(fromTime);
            if (!isNaN(parsed.getTime())) {
              reportDate = toLocalDateStr(parsed);
            }
          }
        }
      }

      // 2. Parse Queues sheet (per-queue data)
      const queuesSheetName = workbook.SheetNames.find(
        (s) => s.toLowerCase() === 'queues'
      );
      if (!queuesSheetName) {
        setMsg({ type: 'error', text: 'No "Queues" sheet found in this file.' });
        return;
      }

      const sheet = workbook.Sheets[queuesSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        setMsg({ type: 'error', text: 'No data rows found in the Queues sheet.' });
        return;
      }

      // 3. Transform rows
      const parsed = rows
        .filter((row) => row.Name || row.name)
        .map((row) => {
          const name = row.Name || row.name;
          const inbound = parseInt(row['# Inbound'] || 0, 10);
          const answered = parseInt(row['# Answered'] || 0, 10);
          const abandoned = parseInt(row['# Abandoned'] || 0, 10);
          const abandonRate = inbound > 0 ? (abandoned / inbound) * 100 : 0;

          return {
            queue_name: name,
            queue_ext: row.Ext || row.ext || null,
            queue_type: deriveQueueType(name),
            inbound,
            answered,
            abandoned,
            avg_handle_time_seconds: parseTimedeltaSeconds(row['Avg. Handle Time']),
            holds: parseInt(row['# Holds'] || 0, 10),
            refused: parseInt(row['# Refused'] || 0, 10),
            abandon_rate: Math.round(abandonRate * 100) / 100,
          };
        });

      if (parsed.length === 0) {
        setMsg({ type: 'error', text: 'No valid queue rows found.' });
        return;
      }

      setPreview(parsed);
      setDetectedDate(reportDate);
    } catch (err) {
      setMsg({ type: 'error', text: `Failed to parse file: ${err.message}` });
    }
  }

  // Compute totals from preview
  const totals = preview ? preview.reduce(
    (acc, row) => ({
      inbound: acc.inbound + row.inbound,
      answered: acc.answered + row.answered,
      abandoned: acc.abandoned + row.abandoned,
    }),
    { inbound: 0, answered: 0, abandoned: 0 }
  ) : null;

  const totalAbandonRate = totals && totals.inbound > 0
    ? (totals.abandoned / totals.inbound) * 100 : 0;

  // High-level warning
  const highAbandonWarning = totals && totals.inbound > 0 && totalAbandonRate >= 25;

  async function confirmUpload() {
    if (!preview || preview.length === 0 || !detectedDate) return;

    setUploading(true);
    setMsg(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const records = preview.map((row) => ({
        org_id: orgId,
        report_date: detectedDate,
        ...row,
        uploaded_by: user?.id,
      }));

      const { error } = await supabase.from('rc_queue_data').upsert(records, {
        onConflict: 'org_id,report_date,queue_name',
      });

      setUploading(false);

      if (error) {
        setMsg({ type: 'error', text: `Upload failed: ${error.message}` });
      } else {
        setMsg({ type: 'success', text: `${records.length} queue records uploaded for ${formatDateShort(detectedDate)}.` });
        setPreview(null);
        setDetectedDate(null);
        if (fileRef.current) fileRef.current.value = '';
        if (onUploaded) onUploaded();
      }
    } catch (err) {
      setUploading(false);
      setMsg({ type: 'error', text: `Upload failed: ${err.message}` });
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Daily Queue Report Upload</h3>
            <p className="text-sm text-gray-500">
              Upload the RingCentral Queues report (XLSX). Captures abandoned calls that the Call Log can't see.
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
          <p className="font-medium mb-2">How to export the Queues report from RingCentral:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700 mb-3">
            <li>Go to RingCentral Analytics &rarr; Performance Reports &rarr; Queues</li>
            <li>Set the date range to the target day</li>
            <li>Export as XLSX</li>
          </ol>
          <p className="font-medium mb-2">Expected sheets:</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li><strong>Filters</strong> &mdash; date range auto-detection</li>
            <li><strong>Queues</strong> &mdash; per-queue breakdown (Name, # Inbound, # Answered, # Abandoned, etc.)</li>
          </ul>
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
        {detectedDate && (
          <span className="text-sm text-gray-500">
            Detected date: {formatDateShort(detectedDate)}
          </span>
        )}
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Queue</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">In</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Ans</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Abn</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Abn%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{cleanQueueName(row.queue_name)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.inbound}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.answered}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.abandoned}</td>
                    <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(row.abandon_rate, row.inbound)}`}>
                      {row.inbound > 0 ? `${row.abandon_rate.toFixed(0)}%` : '\u2014'}
                      {abandonRateIndicator(row.abandon_rate, row.inbound)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-3 py-2 text-gray-900">Total</td>
                  <td className="px-3 py-2 text-right text-gray-700">{totals.inbound}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{totals.answered}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{totals.abandoned}</td>
                  <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(totalAbandonRate, totals.inbound)}`}>
                    {totals.inbound > 0 ? `${totalAbandonRate.toFixed(0)}%` : '\u2014'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* High abandon rate warning */}
          {highAbandonWarning && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {totalAbandonRate >= 100
                ? '100% abandon rate \u2014 no calls answered'
                : `${totalAbandonRate.toFixed(0)}% abandon rate \u2014 check staffing levels`}
            </div>
          )}

          {/* Date warning */}
          {!detectedDate && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Could not auto-detect report date from Filters sheet. Please verify the file is correct.
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={confirmUpload}
              disabled={uploading || !detectedDate}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
            <button
              onClick={() => { setPreview(null); setDetectedDate(null); if (fileRef.current) fileRef.current.value = ''; }}
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
