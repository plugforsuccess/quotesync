// src/pages/RenewalUploadPage.jsx
// XLSX upload flow for Allstate renewal reports.
// Uses SheetJS (XLSX) for parsing. Handles 4-row Allstate header block,
// column mapping, stale check, routing logic, and batch upsert with dedup.

import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Column mapping — includes actual Allstate report column names ───────────

const COLUMN_MAP = {
  // Allstate actual column names
  'insured first name': '_first_name',
  'insured last name': '_last_name',
  'insured name': 'customer_name',
  'premium new($)': 'premium',
  'premium new': 'premium',
  'premium current($)': 'current_premium',
  'premium current': 'current_premium',
  'premium old($)': 'current_premium',
  'premium old': 'current_premium',
  'renewal effective date': 'renewal_date',
  'effective date': 'renewal_date',
  'eff date': 'renewal_date',
  'easy pay': 'eft_on_file',
  'line of business': 'policy_type',
  'lob': 'policy_type',
  'amount due': 'amount_due',
  'amount due($)': 'amount_due',
  'option/package': 'option_package',
  'option package': 'option_package',
  'allstate status': 'renewal_status_allstate',
  'tenure (years)': 'customer_tenure_years',
  'tenure years': 'customer_tenure_years',
  'tenure': 'customer_tenure_years',
  // Generic column names
  'policy number': 'policy_no',
  'policy_number': 'policy_no',
  'policynumber': 'policy_no',
  'policy #': 'policy_no',
  'policy no': 'policy_no',
  'policy type': 'policy_type',
  'policy_type': 'policy_type',
  'policytype': 'policy_type',
  'type': 'policy_type',
  'customer name': 'customer_name',
  'customer_name': 'customer_name',
  'customername': 'customer_name',
  'name': 'customer_name',
  'insured': 'customer_name',
  'renewal date': 'renewal_date',
  'renewal_date': 'renewal_date',
  'renewaldate': 'renewal_date',
  'current premium': 'current_premium',
  'current_premium': 'current_premium',
  'currentpremium': 'current_premium',
  'current prem': 'current_premium',
  'renewal premium': 'premium',
  'renewal_premium': 'premium',
  'renewalpremium': 'premium',
  'new premium': 'premium',
  'renewal prem': 'premium',
  'amount_due': 'amount_due',
  'amountdue': 'amount_due',
  'phone': 'phone',
  'customer_phone': 'phone',
  'customer phone': 'phone',
  'email': 'email',
  'customer_email': 'email',
  'customer email': 'email',
  'address': 'customer_address',
  'customer_address': 'customer_address',
  'customer address': 'customer_address',
  'mortgagee': 'mortgagee',
  'eft on file': 'eft_on_file',
  'eft_on_file': 'eft_on_file',
  'eft': 'eft_on_file',
  'multi-policy': 'multi_policy',
  'multi_policy': 'multi_policy',
  'multipolicy': 'multi_policy',
  'multi policy': 'multi_policy',
  'package': 'option_package',
  'status': 'renewal_status_allstate',
  'renewal status': 'renewal_status_allstate',
  'years': 'customer_tenure_years',
};

// ── Policy type normalization ───────────────────────────────────────────────

const POLICY_TYPE_MAP = {
  auto: 'auto', automobile: 'auto', car: 'auto', vehicle: 'auto', 'auto insurance': 'auto',
  home: 'home', homeowners: 'home', homeowner: 'home', ho: 'home', 'home insurance': 'home',
  condo: 'condo', condominium: 'condo',
  renters: 'renters', renter: 'renters', tenant: 'renters',
  landlord: 'landlord', dwelling: 'landlord',
  pup: 'pup', umbrella: 'pup', 'personal umbrella': 'pup',
  boat: 'boat', watercraft: 'boat',
  manufactured: 'manufactured', 'manufactured home': 'manufactured', 'mobile home': 'manufactured',
  specialty_auto: 'specialty_auto', 'specialty auto': 'specialty_auto', motorcycle: 'specialty_auto',
};

const VALID_POLICY_TYPES = new Set([
  'auto', 'home', 'condo', 'renters', 'landlord', 'pup',
  'boat', 'manufactured', 'specialty_auto', 'other',
]);

function normalizePolicyType(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  return POLICY_TYPE_MAP[key] || (VALID_POLICY_TYPES.has(key) ? key : 'other');
}

// ── Premium parsing ─────────────────────────────────────────────────────────

function parsePremium(val) {
  if (val == null || val === '' || val === 'N/A' || val === 'n/a') return null;
  const cleaned = String(val).replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Date parsing ────────────────────────────────────────────────────────────

function parseRenewalDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const date = new Date(s + 'T00:00:00');
    if (!isNaN(date.getTime())) return s;
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString().split('T')[0];
}

function parseBool(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

function parseInteger(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val).trim(), 10);
  return isNaN(n) ? null : n;
}

function mapHeaders(headers) {
  const mapping = {};
  if (!Array.isArray(headers)) return mapping;
  headers.forEach((h) => {
    if (!h) return;
    const key = String(h).trim().toLowerCase();
    if (COLUMN_MAP[key]) mapping[h] = COLUMN_MAP[key];
  });
  return mapping;
}

// ── Stale date parsing from row 2 ───────────────────────────────────────────

function parseReportDownloadDate(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length < 2) return null;
  const row2 = rawRows[1];
  if (!Array.isArray(row2)) return null;
  for (const cell of row2) {
    if (!cell) continue;
    if (cell instanceof Date && !isNaN(cell.getTime())) {
      return cell.toISOString().split('T')[0];
    }
    const s = String(cell);
    const dateMatch = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dateMatch) {
      const parsed = parseRenewalDate(dateMatch[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function isStaleReport(downloadDate) {
  if (!downloadDate) return false;
  const dl = new Date(downloadDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - dl) / (1000 * 60 * 60 * 24)) > 14;
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

// ── Routing logic ───────────────────────────────────────────────────────────

function applyRoutingRules(row, consentMap, stale) {
  let humanOnly = false;
  let humanOnlyReason = null;

  const consent = row.phone ? consentMap[row.phone] : null;
  if (consent?.dnc) {
    humanOnly = true;
    humanOnlyReason = 'dnc';
  }
  if (!humanOnly && stale) {
    const daysUntil = getDaysUntil(row.renewal_date);
    if (daysUntil !== null && daysUntil <= 60) {
      humanOnly = true;
      humanOnlyReason = 'stale_upload';
    }
  }
  if (!humanOnly && row.current_premium && row.premium && row.premium > row.current_premium * 3) {
    humanOnly = true;
    humanOnlyReason = 'premium_sanity';
    row.premium_sanity_flag = true;
  }
  if (!humanOnly && row.amount_due != null && row.amount_due > 0) {
    humanOnly = true;
    humanOnlyReason = 'amount_due';
  }

  row.human_only = humanOnly;
  row.human_only_reason = humanOnlyReason;
  return row;
}

// ── Safe upsert columns (never overwrite contact/status fields) ─────────────

const SAFE_UPSERT_COLUMNS = [
  'policy_no', 'policy_type', 'customer_name', 'renewal_date',
  'current_premium', 'premium', 'amount_due',
  'phone', 'email', 'customer_address',
  'mortgagee', 'eft_on_file', 'multi_policy',
  'option_package', 'renewal_status_allstate', 'customer_tenure_years',
  'premium_sanity_flag', 'human_only', 'human_only_reason',
  'customer_group_id', 'ai_batch_id', 'agency_id',
];

function pickSafeColumns(row) {
  const safe = {};
  SAFE_UPSERT_COLUMNS.forEach((col) => {
    if (col in row) safe[col] = row[col];
  });
  return safe;
}

const BATCH_SIZE = 200;

// ── Page Component ──────────────────────────────────────────────────────────

export default function RenewalUploadPage() {
  const { currentAgencyId } = useAuth();
  const fileInputRef = useRef(null);

  const [stage, setStage] = useState('upload');
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [skippedRows, setSkippedRows] = useState([]);
  const [headerMapping, setHeaderMapping] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [reportDate, setReportDate] = useState(null);
  const [isStale, setIsStale] = useState(false);

  // Track consent map for routing
  const consentMapRef = useRef({});

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    const ext = selectedFile.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setParseError('Please upload an XLSX or CSV file.');
      return;
    }
    setParseError(null);
    setFile(selectedFile);

    try {
      // Prefetch consent/DNC for routing
      let cMap = {};
      if (currentAgencyId) {
        const { data: consentData } = await supabase
          .from('customer_consent')
          .select('customer_phone, autodial_consent, autodial_consent_date, dnc')
          .eq('agency_id', currentAgencyId);
        if (Array.isArray(consentData)) {
          consentData.forEach((c) => {
            if (c.customer_phone) {
              cMap[c.customer_phone] = {
                autodial_consent: c.autodial_consent,
                autodial_consent_date: c.autodial_consent_date,
                dnc: c.dnc,
              };
            }
          });
        }
        consentMapRef.current = cMap;
      }

      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (!rawRows || rawRows.length < 5) {
        setParseError('File has too few rows. Expected Allstate report with 4-row header block.');
        return;
      }

      // Stale check from row 2
      const dlDate = parseReportDownloadDate(rawRows);
      setReportDate(dlDate);
      const stale = isStaleReport(dlDate);
      setIsStale(stale);

      // Row 5 (index 4) = column headers, row 6+ = data
      const headers = rawRows[4].map((h) => (h != null ? String(h).trim() : ''));
      const mapping = mapHeaders(headers);
      setHeaderMapping(mapping);

      // Check if we have first/last name split (Allstate pattern)
      const hasFirstLast = Object.values(mapping).includes('_first_name') && Object.values(mapping).includes('_last_name');

      const valid = [];
      const skipped = [];

      for (let i = 5; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row)) continue;

        const mapped = {};
        headers.forEach((h, colIdx) => {
          const dbCol = mapping[h];
          if (dbCol && colIdx < row.length) mapped[dbCol] = row[colIdx];
        });

        const hasData = Object.values(mapped).some((v) => v != null && v !== '');
        if (!hasData) continue;

        const rowNum = i + 1;

        // Combine first + last name if split
        if (hasFirstLast && !mapped.customer_name) {
          const first = mapped._first_name ? String(mapped._first_name).trim() : '';
          const last = mapped._last_name ? String(mapped._last_name).trim() : '';
          if (first || last) mapped.customer_name = `${first} ${last}`.trim();
        }

        if (!mapped.policy_no || !String(mapped.policy_no).trim()) {
          skipped.push({ row: rowNum, reason: 'Missing policy number' });
          continue;
        }
        if (!mapped.customer_name || !String(mapped.customer_name).trim()) {
          skipped.push({ row: rowNum, reason: 'Missing customer name' });
          continue;
        }

        const renewalDate = parseRenewalDate(mapped.renewal_date);
        if (!renewalDate) {
          skipped.push({ row: rowNum, reason: `Unparseable renewal date: "${mapped.renewal_date || ''}"` });
          continue;
        }

        const policyType = normalizePolicyType(mapped.policy_type);
        if (!policyType) {
          skipped.push({ row: rowNum, reason: 'Missing policy type' });
          continue;
        }

        const currentPremium = parsePremium(mapped.current_premium);
        const premium = parsePremium(mapped.premium);

        let record = {
          policy_no: String(mapped.policy_no).trim(),
          policy_type: policyType,
          customer_name: String(mapped.customer_name).trim(),
          renewal_date: renewalDate,
          current_premium: currentPremium,
          premium: premium,
          amount_due: parsePremium(mapped.amount_due),
          phone: mapped.phone ? String(mapped.phone).trim() : null,
          email: mapped.email ? String(mapped.email).trim() : null,
          customer_address: mapped.customer_address ? String(mapped.customer_address).trim() : null,
          mortgagee: mapped.mortgagee ? String(mapped.mortgagee).trim() : null,
          eft_on_file: parseBool(mapped.eft_on_file),
          multi_policy: parseBool(mapped.multi_policy) ?? false,
          option_package: mapped.option_package ? String(mapped.option_package).trim() : null,
          renewal_status_allstate: mapped.renewal_status_allstate ? String(mapped.renewal_status_allstate).trim() : null,
          customer_tenure_years: parseInteger(mapped.customer_tenure_years),
          premium_sanity_flag: false,
        };

        record = applyRoutingRules(record, cMap, stale);
        valid.push(record);
      }

      setParsedRows(valid);
      setSkippedRows(skipped);
      setStage('preview');
    } catch (err) {
      setParseError(`Failed to parse file: ${err.message}`);
    }
  }, [currentAgencyId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  // ── Import with safe upsert (preserves contact/status fields) ─────────

  const handleImport = async () => {
    if (!currentAgencyId || parsedRows.length === 0) return;
    setStage('importing');

    try {
      const { data: batch, error: batchErr } = await supabase
        .from('renewal_upload_batches')
        .insert({
          agency_id: currentAgencyId,
          filename: file?.name || 'upload.xlsx',
          row_count: parsedRows.length + skippedRows.length,
          report_download_date: reportDate || null,
          stale_upload: isStale,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      let newlyInserted = 0;
      let updated = 0;
      let errored = 0;
      let groupsCreated = 0;
      const errorLog = [...skippedRows];

      // Group rows by phone for customer_renewal_groups upsert
      const phoneGroups = {};
      parsedRows.forEach((row) => {
        if (row.phone) {
          if (!phoneGroups[row.phone]) {
            phoneGroups[row.phone] = { name: row.customer_name, policies: [] };
          }
          phoneGroups[row.phone].policies.push(row);
        }
      });

      // Upsert customer_renewal_groups
      const groupIdMap = {};
      for (const [phone, group] of Object.entries(phoneGroups)) {
        const totalCurrent = group.policies.reduce((sum, p) => sum + (p.current_premium || 0), 0);
        const totalRenewal = group.policies.reduce((sum, p) => sum + (p.premium || 0), 0);
        const uniqueDates = new Set(group.policies.map((p) => p.renewal_date));
        const hasMultiDateConflict = uniqueDates.size > 1 && group.policies.length > 1;

        let humanOnly = group.policies.some((p) => p.human_only);
        let humanOnlyReason = group.policies.find((p) => p.human_only)?.human_only_reason || null;

        if (!humanOnly && hasMultiDateConflict) {
          humanOnly = true;
          humanOnlyReason = 'multi_date_conflict';
          group.policies.forEach((p) => {
            if (!p.human_only) { p.human_only = true; p.human_only_reason = 'multi_date_conflict'; }
          });
        }

        const { data: grp, error: grpErr } = await supabase
          .from('customer_renewal_groups')
          .upsert({
            agency_id: currentAgencyId, customer_phone: phone, customer_name: group.name,
            total_current_premium: totalCurrent || null, total_renewal_premium: totalRenewal || null,
            policy_count: group.policies.length, human_only: humanOnly, human_only_reason: humanOnlyReason,
          }, { onConflict: 'agency_id,customer_phone' })
          .select('id').single();

        if (!grpErr && grp) { groupIdMap[phone] = grp.id; groupsCreated++; }
      }

      // Two-step upsert: insert new rows, then update existing (safe columns only)
      for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
        const batchRows = parsedRows.slice(i, i + BATCH_SIZE).map((row) => {
          const safe = pickSafeColumns(row);
          safe.agency_id = currentAgencyId;
          safe.ai_batch_id = batch.id;
          safe.customer_group_id = row.phone ? groupIdMap[row.phone] || null : null;
          return safe;
        });

        // Try insert first (new rows only)
        const { data: inserted, error: insertErr } = await supabase
          .from('renewal_cases')
          .upsert(batchRows, {
            onConflict: 'agency_id,policy_no,renewal_date',
            ignoreDuplicates: false,
            // PostgREST upsert: only update safe columns, not contact/status fields
            // The safe columns list ensures no outcome fields are in the payload
          })
          .select('id');

        if (insertErr) {
          errored += batchRows.length;
          errorLog.push({ row: `batch ${Math.floor(i / BATCH_SIZE) + 1}`, reason: insertErr.message });
        } else {
          newlyInserted += (inserted?.length || 0);
        }
      }

      await supabase
        .from('renewal_upload_batches')
        .update({
          rows_imported: newlyInserted,
          rows_updated: updated,
          rows_skipped: skippedRows.length,
          rows_errored: errored,
          groups_created: groupsCreated,
          error_log: errorLog.length > 0 ? errorLog : null,
        })
        .eq('id', batch.id);

      setImportResult({ imported: newlyInserted, updated, skipped: skippedRows.length, errored, groupsCreated, errors: errorLog });
      setStage('done');
    } catch (err) {
      setParseError(`Import failed: ${err.message}`);
      setStage('preview');
    }
  };

  const humanOnlyCount = parsedRows.filter((r) => r.human_only).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <Link to="/admin/renewals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to Renewals
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Upload Renewal Report</h1>

      {stage === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-300 hover:bg-gray-50'
          }`}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-1">Drop your file here, or click to browse</p>
          <p className="text-sm text-gray-500">Accepts Allstate renewal report exports (.xlsx, .xls, .csv)</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />{parseError}
        </div>
      )}

      {stage === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <FileText className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{file?.name}</span>
            {reportDate && <span className="text-xs text-gray-500">Report date: {reportDate}</span>}
          </div>

          {isStale && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Stale Report Warning</p>
                <p className="text-sm text-amber-700">
                  This report was downloaded more than 14 days ago ({reportDate}).
                  Active-window records have been routed to Human Only for manual review.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-sm text-green-700 font-medium">{parsedRows.length} rows ready to import</p>
            </div>
            {skippedRows.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-700 font-medium">{skippedRows.length} rows will be skipped</p>
              </div>
            )}
            {humanOnlyCount > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                <p className="text-sm text-orange-700 font-medium">{humanOnlyCount} routed to Human Only</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Column Mapping</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(headerMapping).filter(([, db]) => !db.startsWith('_')).map(([csv, db]) => (
                <span key={csv} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                  {csv} &rarr; {db}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Policy #</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Customer</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Renewal Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Current</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Renewal</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Routing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className={row.human_only ? 'bg-orange-50' : ''}>
                      <td className="px-3 py-2 font-mono text-xs">{row.policy_no}</td>
                      <td className="px-3 py-2 capitalize">{row.policy_type}</td>
                      <td className="px-3 py-2">{row.customer_name}</td>
                      <td className="px-3 py-2">{row.renewal_date}</td>
                      <td className="px-3 py-2">{row.current_premium != null ? `$${row.current_premium}` : '—'}</td>
                      <td className="px-3 py-2">{row.premium != null ? `$${row.premium}` : '—'}</td>
                      <td className="px-3 py-2">
                        {row.human_only ? (
                          <span className="text-xs font-medium text-orange-700">{(row.human_only_reason || '').replace(/_/g, ' ')}</span>
                        ) : (<span className="text-xs text-green-600">Auto</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {skippedRows.length > 0 && (
            <div>
              <button onClick={() => setShowErrors(!showErrors)} className="flex items-center gap-1 text-sm text-amber-700 font-medium">
                {showErrors ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Skipped rows ({skippedRows.length})
              </button>
              {showErrors && (
                <div className="mt-2 bg-amber-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {skippedRows.map((s, i) => <p key={i} className="text-xs text-amber-800">Row {s.row}: {s.reason}</p>)}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setStage('upload'); setFile(null); setParsedRows([]); setSkippedRows([]); setParseError(null); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Choose Different File
            </button>
            <button onClick={handleImport} disabled={parsedRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50">
              Import {parsedRows.length} Renewals
            </button>
          </div>
        </div>
      )}

      {stage === 'importing' && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">Importing renewals...</p>
          <p className="text-sm text-gray-500">This may take a moment for large files.</p>
        </div>
      )}

      {stage === 'done' && importResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-800">Import Complete</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-green-700 font-medium">{importResult.imported}</p><p className="text-green-600">Imported</p></div>
              <div><p className="text-amber-700 font-medium">{importResult.skipped}</p><p className="text-amber-600">Skipped</p></div>
              <div><p className="text-red-700 font-medium">{importResult.errored}</p><p className="text-red-600">Errored</p></div>
              <div><p className="text-blue-700 font-medium">{importResult.groupsCreated}</p><p className="text-blue-600">Groups</p></div>
            </div>
          </div>

          {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
            <div>
              <button onClick={() => setShowErrors(!showErrors)} className="flex items-center gap-1 text-sm text-gray-600 font-medium">
                {showErrors ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Error details ({importResult.errors.length})
              </button>
              {showErrors && (
                <div className="mt-2 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {importResult.errors.map((e, i) => <p key={i} className="text-xs text-gray-600">Row {e.row}: {e.reason}</p>)}
                </div>
              )}
            </div>
          )}

          <Link to="/admin/renewals"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg">
            Back to Renewals
          </Link>
        </div>
      )}
    </div>
  );
}
