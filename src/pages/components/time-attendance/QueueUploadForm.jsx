// src/pages/components/time-attendance/QueueUploadForm.jsx
// Upload form for RingCentral Queues report (XLSX).
// Parses per-queue daily metrics from the "Queues" sheet and upserts to rc_queue_data.
// Captures abandoned calls that never reach an agent — invisible in the Call Log.

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, BarChart3, AlertCircle, CheckCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import * as XLSX from 'xlsx';

// ── Week Helpers ────────────────────────────────────────────────────────────────

function toMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  if (inbound === 0) return 'text-qs-muted';
  if (rate >= 25) return 'text-red-400';
  if (rate >= 10) return 'text-amber-400';
  return 'text-emerald-400';
}

function abandonRateIndicator(rate, inbound) {
  if (inbound === 0) return null;
  if (rate >= 25) return <span className="text-red-400 ml-1" title="Critical abandon rate">&#x1F534;</span>;
  return null;
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function QueueUploadForm({ orgId, weekStart, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detectedDate, setDetectedDate] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [callLogMissingWarning, setCallLogMissingWarning] = useState(false);
  const fileRef = useRef(null);

  // ── Weekly coverage (Mon–Fri of selected week) ───────────────────────────────
  const currentMonday = weekStart || toMonday(new Date());
  const todayStr = new Date().toLocaleDateString('en-CA');

  const { data: weekCoverage = [], refetch: refetchCoverage } = useQuery({
    queryKey: ['queue_week_coverage', orgId, currentMonday],
    queryFn: async () => {
      const friday = new Date(currentMonday + 'T00:00:00');
      friday.setDate(friday.getDate() + 4);
      const fridayStr = friday.toLocaleDateString('en-CA');

      const { data, error } = await supabase
        .from('rc_queue_data')
        .select('report_date, inbound, abandoned')
        .eq('org_id', orgId)
        .gte('report_date', currentMonday)
        .lte('report_date', fridayStr);

      if (error) throw error;

      // Group by day — sum inbound across all queues
      const byDay = {};
      for (const row of data || []) {
        if (!byDay[row.report_date]) {
          byDay[row.report_date] = { inbound: 0, abandoned: 0 };
        }
        byDay[row.report_date].inbound += row.inbound || 0;
        byDay[row.report_date].abandoned += row.abandoned || 0;
      }

      // Build Mon–Fri array
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(currentMonday + 'T00:00:00');
        d.setDate(d.getDate() + i);
        const ds = d.toLocaleDateString('en-CA');
        const isFuture = ds > todayStr;
        const isToday = ds === todayStr;
        const dayData = byDay[ds] || null;
        const isPast = ds < todayStr;

        days.push({
          date: ds,
          label: d.toLocaleDateString('en-US', {
            weekday: 'short', month: 'numeric', day: 'numeric'
          }),
          isFuture,
          isToday,
          isPast,
          data: dayData,
          abandonRate: dayData && dayData.inbound > 0
            ? Math.round((dayData.abandoned / dayData.inbound) * 100)
            : null,
        });
      }
      return days;
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);
    setDetectedDate(null);
    setCallLogMissingWarning(false);

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

      // Check if call log exists for this date — surface cross-check warning
      // before the principal confirms upload.
      if (reportDate) {
        const { data: clCheck } = await supabase
          .from('rc_call_log')
          .select('id')
          .eq('org_id', orgId)
          .eq('call_date', reportDate)
          .limit(1);
        setCallLogMissingWarning(!clCheck?.length);
      } else {
        setCallLogMissingWarning(false);
      }
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

      // Cross-check: does call log have any data for this date?
      const { data: callLogCheck } = await supabase
        .from('rc_call_log')
        .select('id')
        .eq('org_id', orgId)
        .eq('call_date', detectedDate)
        .limit(1);

      const callLogEmpty = !callLogCheck?.length;
      const queueHasInbound = totals && totals.inbound > 0;
      // Flag if queue shows inbound calls but call log has zero agent records.
      // This is NOT a missing upload — it means calls came in but no agent
      // answered or made calls that day. Could indicate staffing gap or
      // that the office was unmanned.
      const noAgentActivity = callLogEmpty && queueHasInbound;

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
        let successText = `${records.length} queue records uploaded for ${formatDateShort(detectedDate)}.`;
        if (noAgentActivity) {
          successText += ` \u26A0 No agent activity on record for this date \u2014 ${totals.inbound} calls entered the queue with no agent calls logged.`;
        }
        setMsg({
          type: noAgentActivity ? 'warning' : 'success',
          text: successText,
        });
        setPreview(null);
        setDetectedDate(null);
        setCallLogMissingWarning(false);
        if (fileRef.current) fileRef.current.value = '';
        refetchCoverage();
        if (onUploaded) onUploaded();
      }
    } catch (err) {
      setUploading(false);
      setMsg({ type: 'error', text: `Upload failed: ${err.message}` });
    }
  }

  return (
    <div className="bg-qs-card rounded-lg border border-qs-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          <div>
            <h3 className="text-lg font-semibold text-qs-bright">Daily Queue Report Upload</h3>
            <p className="text-sm text-qs-subtle">
              Upload the RingCentral Queues report (XLSX). Captures abandoned calls that the Call Log can't see.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="p-2 text-qs-muted hover:text-primary-400 rounded-lg transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {showHelp && (
        <div className="mb-4 p-4 bg-primary-900/20 rounded-lg text-sm text-primary-300">
          <p className="font-medium mb-2">How to export the Queues report from RingCentral:</p>
          <ol className="list-decimal list-inside space-y-1 text-primary-300 mb-3">
            <li>Go to RingCentral Analytics &rarr; Performance Reports &rarr; Queues</li>
            <li>Set the date range to the target day</li>
            <li>Export as XLSX</li>
          </ol>
          <p className="font-medium mb-2">Expected sheets:</p>
          <ul className="list-disc list-inside space-y-1 text-primary-300">
            <li><strong>Filters</strong> &mdash; date range auto-detection</li>
            <li><strong>Queues</strong> &mdash; per-queue breakdown (Name, # Inbound, # Answered, # Abandoned, etc.)</li>
          </ul>
        </div>
      )}

      {/* Weekly queue upload status */}
      {weekCoverage.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{
            fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
          }}>
            {currentMonday === toMonday(new Date())
              ? 'Upload Status \u2014 This Week'
              : `Upload Status \u2014 Week of ${new Date(currentMonday + 'T00:00:00')
                  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            }
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {weekCoverage.map((day) => {
              const uploaded = !!day.data;
              const missing = !uploaded && day.isPast && !day.isToday;
              const highAbandon = uploaded && day.abandonRate >= 25;

              return (
                <div
                  key={day.date}
                  title={
                    uploaded
                      ? `${day.date}: ${day.data.inbound} inbound \u00B7 ${day.data.abandoned} abandoned \u00B7 ${day.abandonRate}% abandon rate`
                      : day.isFuture ? `${day.date}: future` : `${day.date}: not uploaded`
                  }
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 8, textAlign: 'center',
                    border: `1px solid ${
                      highAbandon ? '#EF444433'
                      : uploaded ? '#10B98133'
                      : missing ? '#EF444433'
                      : 'var(--qs-border)'
                    }`,
                    background: highAbandon ? '#EF444409'
                      : uploaded ? '#10B98109'
                      : missing ? '#EF444409'
                      : 'var(--qs-elevated)',
                  }}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 600, marginBottom: 2,
                    color: highAbandon ? '#EF4444'
                      : uploaded ? '#10B981'
                      : missing ? '#EF4444'
                      : 'var(--qs-muted)',
                  }}>
                    {day.label}
                  </div>
                  <div style={{ fontSize: 16 }}>
                    {uploaded ? (highAbandon ? '\u26A0' : '\u2713') : missing ? '!' : '\u2014'}
                  </div>
                  {uploaded && (
                    <div style={{ fontSize: 9, color: highAbandon ? '#EF4444' : 'var(--qs-muted)', marginTop: 2 }}>
                      {day.abandonRate}% abn
                    </div>
                  )}
                  {missing && (
                    <div style={{ fontSize: 9, color: '#EF4444', marginTop: 2 }}>
                      missing
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Missing days callout */}
          {weekCoverage.some(d => !d.data && d.isPast && !d.isToday) && (
            <p style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>
              {'\u26A0'} {weekCoverage.filter(d => !d.data && d.isPast && !d.isToday).length} day(s)
              missing queue uploads this week
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-qs-elevated hover:bg-qs-card text-qs-text font-medium rounded-lg cursor-pointer transition-colors">
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
          <span className="text-sm text-qs-subtle">
            Detected date: {formatDateShort(detectedDate)}
          </span>
        )}
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="mt-4">
          <div className="overflow-x-auto border border-qs-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-qs-elevated">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-qs-subtle">Queue</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-subtle">In</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-subtle">Ans</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-subtle">Abn</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-subtle">Abn%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-qs-border">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-qs-elevated">
                    <td className="px-3 py-2 text-qs-bright">{cleanQueueName(row.queue_name)}</td>
                    <td className="px-3 py-2 text-right text-qs-dim">{row.inbound}</td>
                    <td className="px-3 py-2 text-right text-qs-dim">{row.answered}</td>
                    <td className="px-3 py-2 text-right text-qs-dim">{row.abandoned}</td>
                    <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(row.abandon_rate, row.inbound)}`}>
                      {row.inbound > 0 ? `${row.abandon_rate.toFixed(0)}%` : '\u2014'}
                      {abandonRateIndicator(row.abandon_rate, row.inbound)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-qs-elevated font-medium">
                  <td className="px-3 py-2 text-qs-bright">Total</td>
                  <td className="px-3 py-2 text-right text-qs-text">{totals.inbound}</td>
                  <td className="px-3 py-2 text-right text-qs-text">{totals.answered}</td>
                  <td className="px-3 py-2 text-right text-qs-text">{totals.abandoned}</td>
                  <td className={`px-3 py-2 text-right font-medium ${abandonRateColor(totalAbandonRate, totals.inbound)}`}>
                    {totals.inbound > 0 ? `${totalAbandonRate.toFixed(0)}%` : '\u2014'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* High abandon rate warning */}
          {highAbandonWarning && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {totalAbandonRate >= 100
                ? '100% abandon rate \u2014 no calls answered'
                : `${totalAbandonRate.toFixed(0)}% abandon rate \u2014 check staffing levels`}
            </div>
          )}

          {/* Date warning */}
          {!detectedDate && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Could not auto-detect report date from Filters sheet. Please verify the file is correct.
            </div>
          )}

          {/* Call log cross-check warning — surfaced before confirming upload */}
          {callLogMissingWarning && totals?.inbound > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>No agent activity on record for {formatDateShort(detectedDate)}.</strong>{' '}
                Queue shows {totals.inbound} inbound call{totals.inbound !== 1 ? 's' : ''} with{' '}
                {totals.abandoned} abandoned &mdash; but no agent calls are logged for this day.
                Verify staffing coverage.
              </span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={confirmUpload}
              disabled={uploading || !detectedDate}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setDetectedDate(null);
                setCallLogMissingWarning(false);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className="px-4 py-2.5 text-qs-text font-medium hover:bg-qs-card rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`mt-3 flex items-center gap-1.5 text-sm ${
          msg.type === 'error'   ? 'text-red-400'
          : msg.type === 'warning' ? 'text-amber-400'
          : 'text-emerald-400'
        }`}>
          {msg.type === 'error'
            ? <AlertCircle className="w-4 h-4" />
            : msg.type === 'warning'
            ? <AlertCircle className="w-4 h-4" />
            : <CheckCircle className="w-4 h-4" />
          }
          {msg.text}
        </div>
      )}
    </div>
  );
}
