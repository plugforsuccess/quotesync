// src/pages/RenewalUploadPage.jsx
// CSV upload flow for Allstate renewal reports.
// Uses papaparse for CSV parsing. Handles column mapping, validation,
// preview, and batch upsert with duplicate detection.

import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Column mapping ──────────────────────────────────────────────────────────

const COLUMN_MAP = {
  'policy number': 'policy_number',
  'policy_number': 'policy_number',
  'policynumber': 'policy_number',
  'policy #': 'policy_number',
  'policy type': 'policy_type',
  'policy_type': 'policy_type',
  'policytype': 'policy_type',
  'type': 'policy_type',
  'customer name': 'customer_name',
  'customer_name': 'customer_name',
  'customername': 'customer_name',
  'name': 'customer_name',
  'insured name': 'customer_name',
  'insured': 'customer_name',
  'renewal date': 'renewal_date',
  'renewal_date': 'renewal_date',
  'renewaldate': 'renewal_date',
  'eff date': 'renewal_date',
  'effective date': 'renewal_date',
  'current premium': 'current_premium',
  'current_premium': 'current_premium',
  'currentpremium': 'current_premium',
  'current prem': 'current_premium',
  'renewal premium': 'renewal_premium',
  'renewal_premium': 'renewal_premium',
  'renewalpremium': 'renewal_premium',
  'new premium': 'renewal_premium',
  'renewal prem': 'renewal_premium',
  'phone': 'customer_phone',
  'customer_phone': 'customer_phone',
  'customer phone': 'customer_phone',
  'email': 'customer_email',
  'customer_email': 'customer_email',
  'customer email': 'customer_email',
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
};

// ── Policy type normalization ───────────────────────────────────────────────

const POLICY_TYPE_MAP = {
  auto: 'auto',
  automobile: 'auto',
  car: 'auto',
  vehicle: 'auto',
  home: 'home',
  homeowners: 'home',
  homeowner: 'home',
  ho: 'home',
  condo: 'condo',
  condominium: 'condo',
  renters: 'renters',
  renter: 'renters',
  tenant: 'renters',
  landlord: 'landlord',
  dwelling: 'landlord',
  pup: 'pup',
  umbrella: 'pup',
  'personal umbrella': 'pup',
  boat: 'boat',
  watercraft: 'boat',
  manufactured: 'manufactured',
  'manufactured home': 'manufactured',
  'mobile home': 'manufactured',
  specialty_auto: 'specialty_auto',
  'specialty auto': 'specialty_auto',
  motorcycle: 'specialty_auto',
};

const VALID_POLICY_TYPES = new Set([
  'auto', 'home', 'condo', 'renters', 'landlord', 'pup',
  'boat', 'manufactured', 'specialty_auto', 'other',
]);

function normalizePolicyType(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  const mapped = POLICY_TYPE_MAP[key];
  if (mapped) return mapped;
  if (VALID_POLICY_TYPES.has(key)) return key;
  return 'other';
}

// ── Premium parsing ─────────────────────────────────────────────────────────

function parsePremium(val) {
  if (val == null || val === '' || val === 'N/A' || val === 'n/a') return null;
  const cleaned = String(val).replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '0' || cleaned === '0.00') {
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Date parsing ────────────────────────────────────────────────────────────

function parseRenewalDate(val) {
  if (!val) return null;
  const s = String(val).trim();

  // Try MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  // Try YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const date = new Date(s + 'T00:00:00');
    if (!isNaN(date.getTime())) return s;
  }

  // Try Date constructor as fallback
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.toISOString().split('T')[0];

  return null;
}

// ── Boolean parsing ─────────────────────────────────────────────────────────

function parseBool(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

// ── Map CSV headers ─────────────────────────────────────────────────────────

function mapHeaders(headers) {
  const mapping = {};
  if (!Array.isArray(headers)) return mapping;
  headers.forEach((h) => {
    const key = String(h).trim().toLowerCase();
    if (COLUMN_MAP[key]) {
      mapping[h] = COLUMN_MAP[key];
    }
  });
  return mapping;
}

// ── Batch size for upserts ──────────────────────────────────────────────────

const BATCH_SIZE = 200;

// ── Page Component ──────────────────────────────────────────────────────────

export default function RenewalUploadPage() {
  const { currentAgencyId } = useAuth();
  const fileInputRef = useRef(null);

  const [stage, setStage] = useState('upload'); // upload | preview | importing | done
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [skippedRows, setSkippedRows] = useState([]);
  const [headerMapping, setHeaderMapping] = useState({});
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  // ── File handling ───────────────────────────────────────────────────────

  const handleFile = useCallback((selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a CSV file.');
      return;
    }
    setParseError(null);
    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setParseError('CSV file is empty or could not be parsed.');
          return;
        }

        const mapping = mapHeaders(results.meta.fields || []);
        setHeaderMapping(mapping);

        const valid = [];
        const skipped = [];

        results.data.forEach((row, idx) => {
          const mapped = {};
          Object.entries(mapping).forEach(([csvCol, dbCol]) => {
            mapped[dbCol] = row[csvCol];
          });

          // Validate required fields
          if (!mapped.policy_number || !String(mapped.policy_number).trim()) {
            skipped.push({ row: idx + 2, reason: 'Missing policy number' });
            return;
          }
          if (!mapped.customer_name || !String(mapped.customer_name).trim()) {
            skipped.push({ row: idx + 2, reason: 'Missing customer name' });
            return;
          }

          const renewalDate = parseRenewalDate(mapped.renewal_date);
          if (!renewalDate) {
            skipped.push({ row: idx + 2, reason: `Unparseable renewal date: "${mapped.renewal_date || ''}"` });
            return;
          }

          const policyType = normalizePolicyType(mapped.policy_type);
          if (!policyType) {
            skipped.push({ row: idx + 2, reason: `Missing policy type` });
            return;
          }

          const currentPremium = parsePremium(mapped.current_premium);
          const renewalPremium = parsePremium(mapped.renewal_premium);

          valid.push({
            policy_number: String(mapped.policy_number).trim(),
            policy_type: policyType,
            customer_name: String(mapped.customer_name).trim(),
            renewal_date: renewalDate,
            current_premium: currentPremium,
            renewal_premium: renewalPremium,
            customer_phone: mapped.customer_phone ? String(mapped.customer_phone).trim() : null,
            customer_email: mapped.customer_email ? String(mapped.customer_email).trim() : null,
            customer_address: mapped.customer_address ? String(mapped.customer_address).trim() : null,
            mortgagee: mapped.mortgagee ? String(mapped.mortgagee).trim() : null,
            eft_on_file: parseBool(mapped.eft_on_file),
            multi_policy: parseBool(mapped.multi_policy) ?? false,
          });
        });

        setParsedRows(valid);
        setSkippedRows(skipped);
        setStage('preview');
      },
      error: (err) => {
        setParseError(`Failed to parse CSV: ${err.message}`);
      },
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  // ── Import ──────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!currentAgencyId || parsedRows.length === 0) return;
    setStage('importing');

    try {
      // Create batch record
      const { data: batch, error: batchErr } = await supabase
        .from('renewal_upload_batches')
        .insert({
          agency_id: currentAgencyId,
          filename: file?.name || 'upload.csv',
          row_count: parsedRows.length + skippedRows.length,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      let imported = 0;
      let updated = 0;
      let errored = 0;
      const errorLog = [...skippedRows];

      // Batch upsert
      for (let i = 0; i < parsedRows.length; i += BATCH_SIZE) {
        const batch_rows = parsedRows.slice(i, i + BATCH_SIZE).map((row) => ({
          ...row,
          agency_id: currentAgencyId,
          upload_batch_id: batch.id,
        }));

        const { data: upserted, error: upsertErr } = await supabase
          .from('renewal_policies')
          .upsert(batch_rows, {
            onConflict: 'agency_id,policy_number,renewal_date',
            ignoreDuplicates: false,
          })
          .select('id');

        if (upsertErr) {
          errored += batch_rows.length;
          errorLog.push({ row: `batch ${Math.floor(i / BATCH_SIZE) + 1}`, reason: upsertErr.message });
        } else {
          imported += (upserted?.length || 0);
        }
      }

      // Update batch record
      await supabase
        .from('renewal_upload_batches')
        .update({
          rows_imported: imported,
          rows_skipped: skippedRows.length,
          rows_errored: errored,
          error_log: errorLog.length > 0 ? errorLog : null,
        })
        .eq('id', batch.id);

      setImportResult({
        imported,
        skipped: skippedRows.length,
        errored,
        errors: errorLog,
      });
      setStage('done');
    } catch (err) {
      setParseError(`Import failed: ${err.message}`);
      setStage('preview');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Back link */}
      <Link to="/admin/renewals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Back to Renewals
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Upload Renewal Report</h1>

      {/* Upload stage */}
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
          <p className="text-lg font-medium text-gray-700 mb-1">
            Drop your CSV file here, or click to browse
          </p>
          <p className="text-sm text-gray-500">
            Accepts Allstate renewal report CSV exports
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          {parseError}
        </div>
      )}

      {/* Preview stage */}
      {stage === 'preview' && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
            <FileText className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{file?.name}</span>
          </div>

          {/* Validation summary */}
          <div className="flex gap-4 flex-wrap">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-sm text-green-700 font-medium">{parsedRows.length} rows ready to import</p>
            </div>
            {skippedRows.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-sm text-amber-700 font-medium">{skippedRows.length} rows will be skipped</p>
              </div>
            )}
          </div>

          {/* Column mapping */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Column Mapping</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(headerMapping).map(([csv, db]) => (
                <span key={csv} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                  {csv} → {db}
                </span>
              ))}
            </div>
          </div>

          {/* Preview table */}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono text-xs">{row.policy_number}</td>
                      <td className="px-3 py-2 capitalize">{row.policy_type}</td>
                      <td className="px-3 py-2">{row.customer_name}</td>
                      <td className="px-3 py-2">{row.renewal_date}</td>
                      <td className="px-3 py-2">{row.current_premium != null ? `$${row.current_premium}` : '—'}</td>
                      <td className="px-3 py-2">{row.renewal_premium != null ? `$${row.renewal_premium}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Skipped rows */}
          {skippedRows.length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="flex items-center gap-1 text-sm text-amber-700 font-medium"
              >
                {showErrors ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Skipped rows ({skippedRows.length})
              </button>
              {showErrors && (
                <div className="mt-2 bg-amber-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {skippedRows.map((s, i) => (
                    <p key={i} className="text-xs text-amber-800">Row {s.row}: {s.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setStage('upload'); setFile(null); setParsedRows([]); setSkippedRows([]); setParseError(null); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Choose Different File
            </button>
            <button
              onClick={handleImport}
              disabled={parsedRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
            >
              Import {parsedRows.length} Renewals
            </button>
          </div>
        </div>
      )}

      {/* Importing stage */}
      {stage === 'importing' && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">Importing renewals...</p>
          <p className="text-sm text-gray-500">This may take a moment for large files.</p>
        </div>
      )}

      {/* Done stage */}
      {stage === 'done' && importResult && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-800">Import Complete</h3>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-green-700 font-medium">{importResult.imported}</p>
                <p className="text-green-600">Imported</p>
              </div>
              <div>
                <p className="text-amber-700 font-medium">{importResult.skipped}</p>
                <p className="text-amber-600">Skipped</p>
              </div>
              <div>
                <p className="text-red-700 font-medium">{importResult.errored}</p>
                <p className="text-red-600">Errored</p>
              </div>
            </div>
          </div>

          {/* Error log */}
          {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="flex items-center gap-1 text-sm text-gray-600 font-medium"
              >
                {showErrors ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Error details ({importResult.errors.length})
              </button>
              {showErrors && (
                <div className="mt-2 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-gray-600">Row {e.row}: {e.reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link
            to="/admin/renewals"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
          >
            Back to Renewals
          </Link>
        </div>
      )}
    </div>
  );
}
