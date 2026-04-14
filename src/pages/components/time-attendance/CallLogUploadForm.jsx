// src/pages/components/time-attendance/CallLogUploadForm.jsx
// Upload form for RingCentral Call Log exports (XLSX or CSV).
// Parses individual call records and upserts to rc_call_log table.
//
// Enterprise hardening:
// - File size + row count limits enforced before parsing
// - Per-row schema validation (required fields, enums, duration bounds)
// - Out-of-bounds values REJECTED (not clamped) to preserve data integrity
// - Phone numbers masked in preview UI — never logged
// - Timestamps normalized to UTC; call_date derived server-side in DB
// - Ingestion batch record created per upload (who/when/hash/stats)
// - Upload result shows inserted/ignored/invalid counts

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Phone, AlertCircle, CheckCircle, HelpCircle, X, UserX } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { normalizeForLookup } from '../../../hooks/useEmployees';
import { parseAsBusinessTz } from '../../../utils/parseAsBusinessTz';
import * as XLSX from 'xlsx';

// ── Constants ───────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_ROWS = 10000;
const BATCH_SIZE = 500;
const VALID_DIRECTIONS = new Set(['Inbound', 'Outbound']);
const VALID_RESULTS = new Set(['Connected', 'Not Connected', 'Answered', 'VM/Missed']);
// RingCentral uses different result labels per direction
const VALID_COMBOS = {
  Outbound: new Set(['Connected', 'Not Connected']),
  Inbound: new Set(['Answered', 'VM/Missed']),
};
const MAX_CALL_DURATION_SEC = 86400; // 24h sanity cap

// Business timezone for preview display (call_date is computed server-side)
const BUSINESS_TZ = 'America/New_York';

// ── PII Masking ─────────────────────────────────────────────────────────────────

function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `***-***-${digits.slice(-4)}`;
  }
  return '***';
}

// ── File Hashing ────────────────────────────────────────────────────────────────

async function computeSHA256(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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

// ── Display Helpers ─────────────────────────────────────────────────────────────

function formatTimeInBusinessTz(date) {
  return date.toLocaleTimeString('en-US', {
    timeZone: BUSINESS_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toBusinessDateStr(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

// ── Agent Name Extraction ───────────────────────────────────────────────────────

function extractAgentName(rawName) {
  if (!rawName) return null;
  let name = rawName
    .replace(/\s*\(\d{3}\)\s*\d{3}-?\d{4}\s*$/, '')
    .replace(/\s*\+\d[\d\s]+$/, '')
    .trim();
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

// ── Row Validation & Transformation ─────────────────────────────────────────────

/**
 * Validate and transform a raw parsed row into a DB-ready record.
 * Returns { record, error } — error is a string if the row is invalid.
 * Out-of-bounds values are REJECTED, not clamped, to preserve data integrity.
 */
function validateAndTransformRow(row, employeeMap, orgId, sourceFilename) {
  // 1. Required fields: Call Direction, Result, Call Start Time
  const direction = (row['Call Direction'] || row.call_direction || '').trim();
  if (!VALID_DIRECTIONS.has(direction)) {
    return { record: null, error: `Invalid direction: "${direction}"` };
  }

  const result = (row.Result || row.result || '').trim();
  if (!VALID_RESULTS.has(result)) {
    return { record: null, error: `Invalid result: "${result}"` };
  }
  if (!VALID_COMBOS[direction].has(result)) {
    return { record: null, error: `Invalid ${direction} result: "${result}" (expected ${[...VALID_COMBOS[direction]].join(' or ')})` };
  }

  const callStartStr = (row['Call Start Time'] || row.call_start_time || '').trim();
  if (!callStartStr) {
    return { record: null, error: 'Missing Call Start Time' };
  }

  const callStart = parseAsBusinessTz(callStartStr);
  if (isNaN(callStart.getTime())) {
    return { record: null, error: `Unparseable timestamp: "${callStartStr}"` };
  }

  // Sanity: reject timestamps before 2020 or more than 1 day in the future
  const now = new Date();
  const minDate = new Date('2020-01-01T00:00:00Z');
  if (callStart < minDate || callStart > new Date(now.getTime() + 86400000)) {
    return { record: null, error: `Timestamp out of range: ${callStart.toISOString()}` };
  }

  // 2. Duration fields — REJECT (not clamp) out-of-bounds values
  const callLengthSec = parseTimedeltaSeconds(row['Call Length'] || row.call_length);
  if (callLengthSec < 0 || callLengthSec > MAX_CALL_DURATION_SEC) {
    return { record: null, error: `Call length out of bounds: ${callLengthSec}s` };
  }

  let handleTimeSec = parseTimedeltaSeconds(row['Handle Time'] || row.handle_time) || null;
  if (handleTimeSec !== null && (handleTimeSec < 0 || handleTimeSec > MAX_CALL_DURATION_SEC)) {
    return { record: null, error: `Handle time out of bounds: ${handleTimeSec}s` };
  }

  // 3. Agent resolution
  const agentName = resolveAgent(row);
  const matchedId = agentName ? employeeMap[normalizeForLookup(agentName)] : null;

  // 4. Queue normalization
  const queue = row.Queue || row.queue || null;
  const cleanQueue = cleanQueueName(queue);
  const queueType = deriveQueueType(queue);

  // NOTE: call_date is NOT sent — it's a GENERATED column computed server-side
  // from call_start_time AT TIME ZONE 'America/New_York'
  const employeeName = agentName || 'Unknown';
  const record = {
    org_id: orgId,
    employee_user_id: matchedId,
    employee_name: employeeName,
    employee_name_key: normalizeForLookup(employeeName),
    session_id: row['Session Id'] || row.session_id || null,
    call_start_time: callStart.toISOString(),  // UTC
    call_direction: direction,
    call_result: result,
    call_length_seconds: callLengthSec,
    handle_time_seconds: handleTimeSec,
    from_name: row['From Name'] || row.from_name || null,
    from_number: row['From Number'] || row.from_number || null,
    to_name: row['To Name'] || row.to_name || null,
    to_number: row['To Number'] || row.to_number || null,
    queue: cleanQueue,
    queue_type: queueType,
    source_filename: sourceFilename,
    // Preview-only fields (stripped before DB write)
    _matched: !!matchedId,
    _time: formatTimeInBusinessTz(callStart),
    _duration: formatDuration(callLengthSec),
    _callDate: toBusinessDateStr(callStart), // for preview date range only
  };

  return { record, error: null };
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function CallLogUploadForm({ orgId, weekStart, employeeMap, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [uploadStats, setUploadStats] = useState(null);
  const fileRef = useRef(null);
  // Store raw file buffer for SHA-256 computation during upload
  const fileBufferRef = useRef(null);
  const fileNameRef = useRef(null);

  // ── Weekly coverage (Mon–Fri of current week) ────────────────────────────────
  const today = new Date();
  const monday = (() => {
    const d = new Date(today);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  })();

  const { data: weekCoverage = [], refetch: refetchCoverage } = useQuery({
    queryKey: ['call_log_week_coverage', orgId, monday],
    queryFn: async () => {
      const friday = new Date(monday + 'T00:00:00');
      friday.setDate(friday.getDate() + 4);
      const fridayStr = friday.toLocaleDateString('en-CA');

      const { data, error } = await supabase
        .from('rc_call_log')
        .select('call_date, call_direction, employee_user_id')
        .eq('org_id', orgId)
        .gte('call_date', monday)
        .lte('call_date', fridayStr);

      if (error) throw error;

      // Group by call_date
      const byDay = {};
      for (const row of data || []) {
        if (!byDay[row.call_date]) {
          byDay[row.call_date] = { records: 0, employees: new Set(), outbound: 0, inbound: 0 };
        }
        byDay[row.call_date].records++;
        byDay[row.call_date].employees.add(row.employee_user_id);
        if (row.call_direction === 'Outbound') byDay[row.call_date].outbound++;
        else byDay[row.call_date].inbound++;
      }

      // Build Mon–Fri array
      const todayStr = today.toLocaleDateString('en-CA');
      const days = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday + 'T00:00:00');
        d.setDate(d.getDate() + i);
        const ds = d.toLocaleDateString('en-CA');
        const isFuture = ds > todayStr;
        const isToday = ds === todayStr;
        days.push({
          date: ds,
          label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
          isFuture,
          isToday,
          data: byDay[ds] || null,
        });
      }
      return days;
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  // ── Recent upload batches ────────────────────────────────────────────────────
  const { data: recentBatches = [], refetch: refetchBatches } = useQuery({
    queryKey: ['rc_call_log_batches_recent', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rc_call_log_batches')
        .select('id, source_filename, uploaded_at, rows_inserted, rows_duplicate, rows_invalid')
        .eq('org_id', orgId)
        .gt('rows_inserted', 0) // only successful uploads
        .order('uploaded_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg(null);
    setPreview(null);
    setValidationErrors([]);
    setUploadStats(null);
    fileBufferRef.current = null;
    fileNameRef.current = null;

    // File size check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMsg({ type: 'error', text: `File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is ${MAX_FILE_SIZE_MB}MB.` });
      return;
    }

    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      let rows;
      let rawBuffer;

      if (isCSV) {
        rawBuffer = await file.arrayBuffer();
        const text = new TextDecoder().decode(rawBuffer);
        rows = parseCSVText(text);
      } else {
        rawBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(rawBuffer, { type: 'array' });
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

      // Store buffer for hash computation during upload
      fileBufferRef.current = rawBuffer;
      fileNameRef.current = file.name;

      if (rows.length === 0) {
        setMsg({ type: 'error', text: 'No data rows found in the file.' });
        return;
      }

      if (rows.length > MAX_ROWS) {
        setMsg({ type: 'error', text: `File has ${rows.length.toLocaleString()} rows. Maximum is ${MAX_ROWS.toLocaleString()}.` });
        return;
      }

      // Validate and transform each row
      const valid = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const { record, error } = validateAndTransformRow(
          rows[i], employeeMap || {}, orgId, file.name
        );
        if (error) {
          errors.push({ row: i + 2, error }); // +2: 1-indexed + header row
        } else {
          valid.push(record);
        }
      }

      if (valid.length === 0) {
        setMsg({
          type: 'error',
          text: `No valid call records found. ${errors.length} row(s) had validation errors.`,
        });
        setValidationErrors(errors.slice(0, 20));
        return;
      }

      setPreview(valid);
      if (errors.length > 0) {
        setValidationErrors(errors.slice(0, 20));
      }
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
    const matched = new Set(preview.filter((r) => r._matched).map((r) => r.employee_name)).size;
    const unmatched = new Set(preview.filter((r) => !r._matched).map((r) => r.employee_name)).size;
    const dateRange = preview.reduce((acc, r) => {
      if (!acc.min || r._callDate < acc.min) acc.min = r._callDate;
      if (!acc.max || r._callDate > acc.max) acc.max = r._callDate;
      return acc;
    }, { min: null, max: null });
    return { outbound, inbound, answered, missed, matched, unmatched, dateRange };
  })() : null;

  function submitUpload() {
    if (!preview || preview.length === 0) return;

    const matchedRows = preview.filter((r) => r._matched);
    const unmatchedNames = [...new Set(preview.filter((r) => !r._matched).map((r) => r.employee_name))];

    if (matchedRows.length === 0) {
      setMsg({ type: 'error', text: 'No calls matched known employees. Check employee names.' });
      return;
    }

    if (unmatchedNames.length > 0) {
      setConfirmModal({
        matchedRows,
        unmatchedNames,
        skippedCount: preview.length - matchedRows.length,
      });
      return;
    }

    doUpload(matchedRows, 0);
  }

  async function doUpload(matchedRows, skippedCount) {
    setConfirmModal(null);
    setUploading(true);
    setMsg(null);
    setUploadStats(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Compute file hash for audit trail + duplicate detection
      let fileHash = 'unknown';
      if (fileBufferRef.current) {
        fileHash = await computeSHA256(fileBufferRef.current);
      }

      // Warn if this exact file was already uploaded
      if (fileHash !== 'unknown') {
        const { data: existingBatch } = await supabase
          .from('rc_call_log_batches')
          .select('id, created_at, rows_inserted')
          .eq('org_id', orgId)
          .eq('source_sha256', fileHash)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingBatch) {
          const when = new Date(existingBatch.created_at).toLocaleString();
          const confirmed = window.confirm(
            `This file was already uploaded on ${when} (${existingBatch.rows_inserted ?? '?'} rows inserted). Upload again?`
          );
          if (!confirmed) {
            setUploading(false);
            return;
          }
        }
      }

      // Create ingestion batch record
      const { data: batch, error: batchError } = await supabase
        .from('rc_call_log_batches')
        .insert({
          org_id: orgId,
          uploaded_by: user?.id,
          source_filename: fileNameRef.current || 'unknown',
          source_sha256: fileHash,
          rows_total: (preview?.length || 0) + validationErrors.length,
          rows_valid: matchedRows.length,
          rows_invalid: validationErrors.length,
          rows_unmatched: skippedCount,
          // rows_inserted and rows_duplicate updated after upserts complete
        })
        .select()
        .single();

      if (batchError) {
        setMsg({ type: 'error', text: `Failed to create batch record: ${batchError.message}` });
        setUploading(false);
        return;
      }

      // Strip preview-only fields and add audit fields
      const records = matchedRows.map(({ _matched, _time, _duration, _callDate, ...row }) => ({
        ...row,
        uploaded_by: user?.id,
        ingestion_batch_id: batch.id,
      }));

      let totalSent = 0;
      let totalInserted = 0;
      let uploadError = null;

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('rc_call_log')
          .upsert(chunk, {
            onConflict: 'org_id,employee_user_id,call_start_time,call_direction,call_result',
            ignoreDuplicates: true,
          })
          .select('id');

        if (error) {
          uploadError = error;
          break;
        }
        totalSent += chunk.length;
        totalInserted += data?.length || 0;
      }

      // Update batch with final stats
      const totalDuplicate = totalSent - totalInserted;
      await supabase
        .from('rc_call_log_batches')
        .update({
          rows_inserted: totalInserted,
          rows_duplicate: totalDuplicate,
        })
        .eq('id', batch.id);

      setUploading(false);

      if (uploadError) {
        setMsg({ type: 'error', text: `Upload failed: ${uploadError.message}` });
      } else {
        const stats = {
          batchId: batch.id,
          sent: totalSent,
          inserted: totalInserted,
          ignored: totalDuplicate,
          skipped: skippedCount,
          invalid: validationErrors.length,
        };
        setUploadStats(stats);

        const warnIgnore = totalDuplicate > 0 && totalDuplicate > totalSent * 0.5;
        const skipNote = skippedCount > 0 ? `, ${skippedCount} unmatched skipped` : '';
        const ignoreNote = totalDuplicate > 0 ? `, ${totalDuplicate} duplicates ignored` : '';

        setMsg({
          type: warnIgnore ? 'warning' : 'success',
          text: `${totalInserted} new records inserted${ignoreNote}${skipNote}.${warnIgnore ? ' High duplicate ratio — this file may have been uploaded before.' : ''}`,
        });
        setPreview(null);
        setValidationErrors([]);
        fileBufferRef.current = null;
        fileNameRef.current = null;
        if (fileRef.current) fileRef.current.value = '';
        refetchCoverage();
        refetchBatches();
        if (onUploaded) onUploaded();
      }
    } catch (err) {
      setUploading(false);
      setMsg({ type: 'error', text: `Upload failed: ${err.message}` });
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
    <div className="bg-qs-card rounded-lg border border-qs-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Phone className="w-6 h-6 text-primary-400" />
          <div>
            <h3 className="text-lg font-semibold text-qs-bright">Daily Call Log Upload</h3>
            <p className="text-sm text-qs-subtle">
              Upload the RingCentral Call Log export (XLSX or CSV). Export all employees unfiltered —
              one upload covers your entire team. Upload daily at end of business.
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
          <p className="font-medium mb-2">How to export the Call Log from RingCentral:</p>
          <ol className="list-decimal list-inside space-y-1 text-primary-300 mb-3">
            <li>Go to RingCentral Analytics &rarr; Performance Reports &rarr; Calls</li>
            <li>Set the date range to <strong>yesterday</strong> (single day)</li>
            <li>
              <strong>Remove any user/agent filter</strong> &mdash; export all employees at once.
              One file covers your entire team regardless of size.
            </li>
            <li>Export as XLSX or CSV</li>
          </ol>
          <div style={{
            background: '#3B82F611', border: '1px solid #3B82F633',
            borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12,
          }}>
            <strong style={{ color: '#3B82F6' }}>💡 One upload = all agents</strong>
            <p style={{ color: 'var(--qs-dim)', marginTop: 4 }}>
              Don't filter by employee in RingCentral before exporting. The system
              automatically matches each call row to the correct agent by name.
              With 10 employees, you still upload exactly one file per day.
            </p>
          </div>
          <p className="font-medium mb-2">Expected columns (from the &ldquo;Calls&rdquo; sheet):</p>
          <ul className="list-disc list-inside space-y-1 text-primary-300">
            <li><strong>From Name</strong>, <strong>To Name</strong> &mdash; agent identification</li>
            <li><strong>Call Direction</strong> &mdash; Inbound or Outbound</li>
            <li><strong>Result</strong> &mdash; Connected, Not Connected, Answered, or VM/Missed</li>
            <li><strong>Call Length</strong>, <strong>Handle Time</strong> &mdash; HH:MM:SS</li>
            <li><strong>Queue</strong> &mdash; Sales or Service queue name</li>
          </ul>
        </div>
      )}

      {/* Weekly upload coverage */}
      {weekCoverage.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--qs-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            This Week's Upload Status
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {weekCoverage.map((day) => {
              const uploaded = !!day.data;
              const missing = !uploaded && !day.isFuture && !day.isToday;

              return (
                <div
                  key={day.date}
                  title={
                    uploaded
                      ? `${day.date}: ${day.data.records} records · ${day.data.employees.size} employee(s) · ${day.data.outbound} out / ${day.data.inbound} in`
                      : day.isFuture
                      ? `${day.date}: future date`
                      : `${day.date}: not yet uploaded`
                  }
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 8, textAlign: 'center',
                    border: `1px solid ${uploaded ? '#10B98133' : missing ? '#EF444433' : 'var(--qs-border)'}`,
                    background: uploaded ? '#10B98109' : missing ? '#EF444409' : 'var(--qs-elevated)',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600,
                    color: uploaded ? '#10B981' : missing ? '#EF4444' : 'var(--qs-muted)',
                    marginBottom: 2 }}>
                    {day.label}
                  </div>
                  <div style={{ fontSize: 16 }}>
                    {uploaded ? '✓' : missing ? '!' : day.isToday ? '·' : '—'}
                  </div>
                  {uploaded && (
                    <div style={{ fontSize: 9, color: 'var(--qs-muted)', marginTop: 2 }}>
                      {day.data.records} calls
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
          {weekCoverage.some(d => !d.data && !d.isFuture && !d.isToday) && (
            <p style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>
              ⚠ {weekCoverage.filter(d => !d.data && !d.isFuture && !d.isToday).length} day(s)
              missing uploads this week
            </p>
          )}
        </div>
      )}

      {/* Recent uploads */}
      {recentBatches.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 11, color: 'var(--qs-subtle)', cursor: 'pointer',
            userSelect: 'none', marginBottom: 4 }}>
            Recent uploads ({recentBatches.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {recentBatches.map(b => (
              <div key={b.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 11, color: 'var(--qs-dim)', padding: '4px 8px',
                background: 'var(--qs-elevated)', borderRadius: 6,
              }}>
                <span style={{ color: 'var(--qs-text)', fontWeight: 500 }}>
                  {new Date(b.uploaded_at).toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <span style={{ color: 'var(--qs-muted)', fontSize: 10, maxWidth: 160,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.source_filename}
                </span>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  +{b.rows_inserted}
                  {b.rows_duplicate > 0 &&
                    <span style={{ color: 'var(--qs-muted)', fontWeight: 400 }}>
                      {' '}({b.rows_duplicate} dupes)
                    </span>
                  }
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2.5 bg-qs-elevated hover:bg-qs-card text-qs-text font-medium rounded-lg cursor-pointer transition-colors">
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
          <span className="text-sm text-qs-subtle">
            Date range: {summary.dateRange.min} &mdash; {summary.dateRange.max}
          </span>
        )}
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
          <p className="text-sm font-medium text-amber-300 mb-1">
            {validationErrors.length} row{validationErrors.length > 1 ? 's' : ''} rejected (validation errors):
          </p>
          <ul className="text-xs text-amber-300 space-y-0.5 max-h-32 overflow-y-auto">
            {validationErrors.map((ve, i) => (
              <li key={i}>Row {ve.row}: {ve.error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview && preview.length > 0 && summary && (
        <div className="mt-4">
          <div className="mb-3 p-3 bg-qs-elevated rounded-lg">
            <p className="text-sm font-medium text-qs-text">
              {preview.length} valid calls: {summary.outbound} outbound, {summary.inbound} inbound
              ({summary.answered} answered, {summary.missed} missed).
              {' '}{summary.matched} agent{summary.matched !== 1 ? 's' : ''} matched
              {summary.unmatched > 0 && (
                <span className="text-amber-400">, {summary.unmatched} unmatched</span>
              )}
              .
            </p>
          </div>

          <div className="overflow-x-auto border border-qs-border rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-qs-elevated sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-qs-dim">Agent</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-qs-dim">Direction</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-qs-dim">Result</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">Duration</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-qs-dim">Queue</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-qs-dim">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-qs-border">
                {preview.slice(0, 100).map((row, i) => (
                  <tr key={i} className={row._matched ? 'hover:bg-qs-elevated' : 'bg-amber-900/10 hover:bg-amber-900/20'}>
                    <td className="px-3 py-2 text-qs-bright">
                      {row.employee_name}
                      {!row._matched && <span className="ml-1 text-xs text-amber-400" title="No matching employee found">(?)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.call_direction === 'Outbound' ? 'bg-primary-900/20 text-primary-300' : 'bg-emerald-900/20 text-emerald-300'
                      }`}>
                        {row.call_direction === 'Outbound' ? 'Out' : 'In'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${
                        row.call_result === 'VM/Missed' ? 'text-red-400' :
                        row.call_result === 'Not Connected' ? 'text-amber-400' :
                        row.call_result === 'Connected' ? 'text-primary-400' : 'text-emerald-400'
                      }`}>
                        {row.call_result === 'VM/Missed' ? 'Missed' : row.call_result}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-qs-dim font-mono">{row._duration}</td>
                    <td className="px-3 py-2 text-qs-dim">{row.queue || '—'}</td>
                    <td className="px-3 py-2 text-right text-qs-dim">{row._time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 100 && (
            <p className="text-xs text-qs-subtle mt-1">Showing first 100 of {preview.length} rows.</p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={submitUpload}
              disabled={uploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
            <button
              onClick={() => { setPreview(null); setValidationErrors([]); fileBufferRef.current = null; if (fileRef.current) fileRef.current.value = ''; }}
              className="px-4 py-2.5 text-qs-text font-medium hover:bg-qs-card rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upload result stats */}
      {uploadStats && (
        <div className="mt-3 p-3 bg-qs-elevated rounded-lg text-xs text-qs-dim">
          <div className="flex items-center gap-4 flex-wrap">
            <span>Sent: <strong>{uploadStats.sent}</strong></span>
            <span>Inserted: <strong className="text-emerald-300">{uploadStats.inserted}</strong></span>
            {uploadStats.ignored > 0 && (
              <span>Duplicates ignored: <strong className="text-qs-subtle">{uploadStats.ignored}</strong></span>
            )}
            {uploadStats.skipped > 0 && (
              <span>Unmatched skipped: <strong className="text-amber-400">{uploadStats.skipped}</strong></span>
            )}
            {uploadStats.invalid > 0 && (
              <span>Invalid rejected: <strong className="text-red-400">{uploadStats.invalid}</strong></span>
            )}
          </div>
          <p className="mt-1 text-qs-muted">Batch: {uploadStats.batchId?.substring(0, 8)}</p>
        </div>
      )}

      {msg && (
        <div className={`mt-3 flex items-center gap-1.5 text-sm ${
          msg.type === 'error' ? 'text-red-400' :
          msg.type === 'warning' ? 'text-amber-400' : 'text-emerald-400'
        }`}>
          {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
           msg.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
           <CheckCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Unmatched rows confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/70 transition-opacity"
            onClick={() => setConfirmModal(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md rounded-lg shadow-xl" style={{ background: '#161924' }}>
              <div className="border-b border-qs-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserX className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-semibold text-qs-bright">Unmatched Employees</h3>
                  </div>
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="text-qs-muted hover:text-qs-subtle transition"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-qs-dim mb-3">
                  {confirmModal.skippedCount} call{confirmModal.skippedCount > 1 ? 's' : ''} will be skipped
                  because {confirmModal.unmatchedNames.length > 1 ? 'these agents don\u2019t' : 'this agent doesn\u2019t'} match any known employee:
                </p>
                <ul className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto mb-4">
                  {confirmModal.unmatchedNames.map((name, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-qs-text">
                  <span className="font-medium text-qs-bright">{confirmModal.matchedRows.length}</span> matched call{confirmModal.matchedRows.length !== 1 ? 's' : ''} will be uploaded.
                </p>
              </div>
              <div className="border-t border-qs-border px-6 py-4 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-sm font-medium text-qs-text bg-qs-elevated border border-qs-border rounded-lg hover:bg-qs-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => doUpload(confirmModal.matchedRows, confirmModal.skippedCount)}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 transition-colors"
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
