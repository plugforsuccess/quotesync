import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart, ReferenceLine, Cell } from "recharts";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useCurrentAgency } from "../hooks/useAgencyLeads";
import { calcRenewalPriority, calcCancelPriority, CURRENT_YEAR } from '../lib/retentionPriority';

// ─── Friendly error messages ──────────────────────────────────────────────────
function friendlyUploadError(raw = "") {
  const msg = raw.toLowerCase();

  if (msg.includes("conflict do update command cannot affect row a second time"))
    return "Your report contains duplicate policy numbers. Remove the duplicates and re-upload.";

  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("using expression"))
    return "Permission error — your session may have expired. Please refresh the page and try again.";

  if (msg.includes("unique constraint") || msg.includes("unique or exclusion constraint") || msg.includes("duplicate key"))
    return "Some rows already exist. Try re-uploading — the duplicate rows will be skipped automatically.";

  if (msg.includes("violates not-null constraint"))
    return "One or more required fields are missing. Check that the report has Policy Number and all required columns.";

  if (msg.includes("invalid input syntax for type"))
    return "A value in the report couldn't be read — check for invalid dates or non-numeric values.";

  if (msg.includes("could not find required columns"))
    return "Required columns are missing. Make sure the report includes Policy No and Cancel Date columns.";

  if (msg.includes("no valid rows"))
    return "No readable rows found. Check that the file isn't empty and has a Policy No column.";

  if (msg.includes("file read failed"))
    return "The file couldn't be opened. Try saving it again as .xlsx or .csv and re-uploading.";

  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch"))
    return "Connection error — check your internet and try again.";

  return "Something went wrong. If this keeps happening, screenshot this and contact support.";
}

// ─── Portfolio Points Matrix (must match RevenueProjectionsDashboard) ─────────
import { LAPSE_PORTFOLIO_POINTS } from "../lib/lapseConstants";

function normaliseProduct(raw = "") {
  const v = raw.toLowerCase().trim();
  // specialty auto MUST be checked before standard auto — both contain "auto"
  if (v.includes("specialty auto") || v.includes("auto - special") || v.includes("motorcycle") || v.includes("motor home") || v.includes("off-road") || v.includes("trailer")) return "specialty_auto";
  if (v.includes("standard auto") || v.includes("private passenger") || v.includes("auto -") || v.includes("auto–")) return "auto";
  // manufactured/mobilehome MUST be checked before ho — "mobilehome" doesn't contain "home" but "manufactured home" does
  if (v.includes("manufactured") || v.includes("mobilehome") || v.includes("mobile home")) return "manufactured";
  if (v.includes("condo") || v.includes("ho6")) return "condo";
  if (v.includes("home") || v.includes("ho3")) return "ho";
  if (v.includes("rent") || v.includes("ho4")) return "renters";
  if (v.includes("landlord")) return "landlord";  // separate from ho — same pts but tracked independently
  if (v.includes("umbrella") || v.includes("pup")) return "pup";
  if (v.includes("boat") || v.includes("watercraft") || v.includes("inland marine")) return "boat";
  if (v.includes("motor club")) return "motor_club";
  return "other";
}

// Points are per ITEM — a 2-car auto lapse = 2 items × 10 pts = 20 pts lost
function calcLapsePoints(rows) {
  return rows.reduce((s, r) => s + (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1), 0);
}

const STATUS_CONFIG = {
  pending:                { label: "Pending",           color: "#94A3B8", bg: "#94A3B822" },
  attempting:             { label: "Attempting",         color: "#F59E0B", bg: "#F59E0B22" },
  left_voicemail:         { label: "Left Voicemail",    color: "#F59E0B", bg: "#F59E0B22" },
  contacted:              { label: "Contacted",         color: "#3B82F6", bg: "#3B82F622" }, // legacy
  payment_plan_requested: { label: "Payment Plan",      color: "#8B5CF6", bg: "#8B5CF622" },
  promise_to_pay:         { label: "Promise to Pay",    color: "#8B5CF6", bg: "#8B5CF622" },
  saved:                  { label: "Saved ✓",      color: "#10B981", bg: "#10B98122" },
  promise_broken:         { label: "Promise Broken",    color: "#EF4444", bg: "#EF444422" },
  requested_cancellation: { label: "Wants to Cancel",   color: "#EF4444", bg: "#EF444422" },
  lost:                   { label: "Lost",              color: "#64748B", bg: "#64748B22" },
  auto_resolved:          { label: "Auto-Resolved",     color: "#64748B", bg: "#47556922" },
};

const TERMINATION_REASONS = ["Price", "Service", "Claims", "Moving", "Coverage no longer needed", "Other"];
const CONTACT_METHODS = ["phone", "text", "email", "other"];

const COL_MAP = {
  policy_no:      ["policy number", "policy no", "policy #", "pol no", "pol #"],
  customer_first: ["insured first name", "first name"],
  customer_last:  ["insured last name", "last name"],
  customer:       ["customer name", "insured name", "insured", "name", "customer"],
  product:        ["product name", "line code", "product code", "line of business", "lob", "coverage type", "policy type", "product"],
  premium:        ["premium new($)", "premium new", "written premium", "annual premium", "premium", "policy premium"],
  prior_premium:  ["premium old($)", "premium old", "prior premium", "previous premium", "original premium"],
  phone:          ["insured phone", "phone number", "phone", "mobile", "cell"],
  items:          ["no. of items", "item count", "items", "number of items"],
  cancel_date:    ["pending cancel date", "termination effective", "cancellation date", "cancel date", "cancel effective date", "eff cancel date", "cancellation effective date"],
  amount_due:     ["amount due($)", "amount due", "amt due", "balance due"],
  cancel_status:  ["status"],
  original_year:  ["original year", "orig year", "policy year"],
};



function findCol(headers, aliases) {
  for (const a of aliases) {
    const idx = headers.findIndex(h => h?.toString().toLowerCase().trim().includes(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

function fmt$(n) {
  if (!n && n !== 0) return "—";
  return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toLocaleString()}`;
}
function fmtFull$(n) {
  if (!n && n !== 0) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function maskCustomerName(name) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function daysUntilCancel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

function urgencyColor(days) {
  if (days <= 3) return "#EF4444";
  if (days <= 7) return "#F59E0B";
  return "#10B981";
}

// ─── Upload Parser ─────────────────────────────────────────────────────────────

function parseReport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        let headerRow = 0;
        for (let i = 0; i < Math.min(10, raw.length); i++) {
          const idx = findCol(raw[i].map(String), COL_MAP.policy_no);
          if (idx >= 0) { headerRow = i; break; }
        }

        const headers = raw[headerRow].map(h => h?.toString().toLowerCase().trim());
        const pi = findCol(headers, COL_MAP.policy_no);
        const ciFirst    = findCol(headers, COL_MAP.customer_first);
        const ciLast     = findCol(headers, COL_MAP.customer_last);
        const ciCombined = findCol(headers, COL_MAP.customer);
        const pri = findCol(headers, COL_MAP.product);
        const pmi = findCol(headers, COL_MAP.premium);
        const di = findCol(headers, COL_MAP.cancel_date);
        const phoneI     = findCol(headers, COL_MAP.phone);
        const priorPmI   = findCol(headers, COL_MAP.prior_premium);
        const itemsI     = findCol(headers, COL_MAP.items);
        const amountDueI    = findCol(headers, COL_MAP.amount_due);
        const cancelStatusI = findCol(headers, COL_MAP.cancel_status);
        const origYearI     = findCol(headers, COL_MAP.original_year);

        if (pi < 0 || di < 0) throw new Error("Could not find required columns (Policy No, Cancel Date). Check report format.");

        const today = new Date().toISOString().slice(0, 10);
        const rows = [];

        for (let i = headerRow + 1; i < raw.length; i++) {
          const row = raw[i];
          const policyNo = row[pi]?.toString().trim();
          if (!policyNo) continue;

          let cancelDate = today;
          if (di >= 0 && row[di]) {
            const d = row[di] instanceof Date ? row[di] : new Date(row[di]);
            if (!isNaN(d)) cancelDate = d.toISOString().slice(0, 10);
          }

          let premium = null;
          if (pmi >= 0 && row[pmi]) {
            const p = parseFloat(row[pmi].toString().replace(/[$,]/g, ""));
            if (!isNaN(p)) premium = p;
          }

          let customerName = null;
          if (ciFirst >= 0 && ciLast >= 0) {
            const first = row[ciFirst]?.toString().trim() || "";
            const last  = row[ciLast]?.toString().trim() || "";
            if (first || last) customerName = `${first} ${last}`.trim();
          } else if (ciCombined >= 0) {
            customerName = row[ciCombined]?.toString().trim() || null;
          }

          const phone = phoneI >= 0 ? (row[phoneI]?.toString().trim() || null) : null;

          let prior_premium = null;
          if (priorPmI >= 0 && row[priorPmI]) {
            const p = parseFloat(row[priorPmI].toString().replace(/[$,]/g, ""));
            if (!isNaN(p)) prior_premium = p;
          }

          const item_count = itemsI >= 0 ? (parseInt(row[itemsI]) || 1) : null;

          rows.push({
            policy_no:             policyNo,
            customer_name:         customerName,
            product:               normaliseProduct(pri >= 0 ? row[pri]?.toString() : ""),
            premium_at_risk:       premium,
            prior_premium,
            phone,
            item_count,
            cancel_effective_date: cancelDate,
            amount_due:    amountDueI >= 0 ? (parseFloat(String(row[amountDueI]).replace(/[$,]/g, '')) || null) : null,
            original_year: origYearI >= 0 ? parseInt(row[origYearI]) || null : null,
            stage: (cancelStatusI >= 0 && row[cancelStatusI]?.toString().trim() === 'Cancelled')
              ? 'cancelled'
              : 'pending_cancel',
          });
        }

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Diff Engine ───────────────────────────────────────────────────────────────

function diffReport(parsed, existing) {
  const today = new Date().toISOString().slice(0, 10);
  const makeKey = (pno, cdate) => `${pno.toLowerCase()}|${cdate}`;
  const parsedKeys = new Set(parsed.map(r => makeKey(r.policy_no, r.cancel_effective_date)));

  const activeStatuses = ["pending", "contacted", "promise_to_pay", "promise_broken"];
  const activeEvents = existing.filter(e => activeStatuses.includes(e.status));
  const activeKeys = new Map(activeEvents.map(e => [makeKey(e.policy_no, e.cancel_effective_date), e]));

  const toAdd = [];
  const toUpdate = [];
  const duplicates = [];

  for (const row of parsed) {
    const key = makeKey(row.policy_no, row.cancel_effective_date);
    if (activeKeys.has(key)) {
      const ex = activeKeys.get(key);
      const needsUpdate =
        ex.last_seen_on !== today ||
        ex.premium_at_risk !== row.premium_at_risk ||
        (row.stage === 'cancelled' && ex.stage !== 'cancelled') ||
        (row.amount_due != null && ex.amount_due !== row.amount_due);
      if (needsUpdate) {
        toUpdate.push({
          id: ex.id,
          last_seen_on: today,
          premium_at_risk: row.premium_at_risk,
          prior_premium: row.prior_premium,
          ...(row.stage === 'cancelled' ? { stage: 'cancelled', amount_due: row.amount_due } : {}),
        });
      } else {
        duplicates.push(key);
      }
    } else {
      const priorEvents = existing.filter(e => e.policy_no.toLowerCase() === row.policy_no.toLowerCase());
      const cycle = priorEvents.length + 1;
      toAdd.push({ ...row, cycle, first_seen_on: today, last_seen_on: today });
    }
  }

  const toAutoResolve = activeEvents
    .filter(e => !parsedKeys.has(makeKey(e.policy_no, e.cancel_effective_date)))
    .map(e => ({ id: e.id }));

  return { toAdd, toUpdate, toAutoResolve, duplicates };
}

// ─── Module-Level Sub-Components ───────────────────────────────────────────────

function SortTh({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: "pointer", userSelect: "none" }}>
      {label} {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
    </th>
  );
}

function KpiCard({ label, value, sub, color, urgent, urgentCount }) {
  return (
    <div className="card" style={{ position: "relative" }}>
      {urgent && (
        <div style={{ position: "absolute", top: 10, right: 10, background: "#EF444422", color: "#EF4444", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>
          {urgentCount} URGENT
        </div>
      )}
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Customer Drilldown Modal ──────────────────────────────────────────────────────

function CustomerDrilldownModal({ event, onClose }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const premiumChangePct = event.prior_premium && event.premium_at_risk
    ? ((event.premium_at_risk - event.prior_premium) / event.prior_premium) * 100
    : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: 14, width: "100%", maxWidth: "98vw", height: "96vh", overflow: "auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>
              {maskCustomerName(event.customer_name) || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Policy #{event.policy_no || "\u2014"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Detail grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
          {[
            { label: "Product",          value: event.product?.toUpperCase() || "\u2014",                              color: "#E2E8F0" },
            { label: "Cancel Date",      value: event.cancel_effective_date || "\u2014",                               color: urgencyColor(days) },
            { label: "Days Left",        value: days <= 0 ? "PAST DUE" : `${days} days`,                         color: urgencyColor(days) },
            { label: "Phone",            value: event.phone || "\u2014",                                               color: event.phone ? "#E2E8F0" : "#334155" },
            { label: "Premium at Risk",  value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "\u2014",    color: "#E2E8F0" },
            { label: "Prior Premium",    value: event.prior_premium ? fmtFull$(event.prior_premium) : "\u2014",        color: "#94A3B8" },
            {
              label: "Premium Change",
              value: premiumChangePct !== null ? `${premiumChangePct >= 0 ? "+" : ""}${premiumChangePct.toFixed(1)}%` : "\u2014",
              color: premiumChangePct === null ? "#334155" : premiumChangePct > 0 ? "#EF4444" : "#10B981",
            },
            { label: "Items at Risk",    value: event.item_count != null ? String(event.item_count) : "\u2014",        color: "#E2E8F0" },
            { label: "Status",           value: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).label,     color: (STATUS_CONFIG[event.status] || STATUS_CONFIG.pending).color },
            { label: "Assigned To",      value: event.assigned_to || "Unassigned",                                color: "#94A3B8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A" }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Notes — full width, only if present */}
        {event.notes && (
          <div style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A", marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
            <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{event.notes}</div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "#334155", marginTop: 16, textAlign: "center" }}>
          Click the row to open the full edit modal
        </div>
      </div>
    </div>
  );
}

// ─── Resolved Tab ────────────────────────────────────────────────────────────

function ResolvedTab({ resolvedEvents }) {
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: 800 }}>
          <thead>
            <tr>
              <th>Resolution Date</th>
              <th>Customer</th>
              <th>Policy</th>
              <th>Product</th>
              <th>Premium</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {resolvedEvents.map(event => {
              const sc = STATUS_CONFIG[event.status] || STATUS_CONFIG.pending;
              return (
                <tr key={event.id}>
                  <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    {event.resolution_date || event.updated_at?.slice(0, 10) || "—"}
                  </td>
                  <td style={{ color: "#E2E8F0", fontWeight: 500 }}>{maskCustomerName(event.customer_name)}</td>
                  <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{event.policy_no}</td>
                  <td style={{ color: "#94A3B8", fontSize: 12 }}>{event.product?.toUpperCase() || "—"}</td>
                  <td style={{ color: "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>
                    {event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "—"}
                  </td>
                  <td>
                    <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td style={{ color: "#64748B", fontSize: 12 }}>{event.assigned_to || "—"}</td>
                  <td style={{ color: "#64748B", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.notes || "—"}
                  </td>
                </tr>
              );
            })}
            {resolvedEvents.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#334155", padding: "32px 0" }}>
                No resolved events yet
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Upload Tab ──────────────────────────────────────────────────────────────

function UploadTab({ uploadFile, uploadError, uploadMsg, isParsing, isCommitting, diffResult, fileInputRef, onFileSelect, onCommit, onCancel }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
        Upload the Allstate <span style={{ color: "#64748B", fontFamily: "'DM Mono', monospace" }}>Pending Cancellation</span> report (XLSX).
        The system will diff against existing active events — new policies added, resolved policies auto-closed.
      </div>

      <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFileSelect(e.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }}
          onChange={e => onFileSelect(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 14, color: "#94A3B8", fontWeight: 500 }}>
          {uploadFile ? uploadFile.name : "Drop report here or click to browse"}
        </div>
        {isParsing && <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>Parsing\u2026</div>}
      </div>

      {uploadError && (
        <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#EF4444" }}>
          {uploadError}
        </div>
      )}

      {diffResult && !uploadMsg && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 12 }}>Review before committing</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "New Policies", value: diffResult.toAdd.length, color: "#10B981" },
              { label: "Updated", value: diffResult.toUpdate.length, color: "#3B82F6" },
              { label: "Auto-Resolved", value: diffResult.toAutoResolve.length, color: "#F59E0B" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Stage breakdown — shown for Cancellation Audit uploads */}
          {diffResult && (diffResult.stage1Count != null || diffResult.stage2Count != null) && (
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6, marginBottom: 10 }}>
              <span style={{ color: '#F59E0B' }}>⚠ {diffResult.stage1Count ?? 0} pending (Cancel)</span>
              {' · '}
              <span style={{ color: '#EF4444' }}>🚫 {diffResult.stage2Count ?? 0} lapsed (Cancelled)</span>
            </div>
          )}

          {diffResult.toAutoResolve.length > 0 && (
            <div style={{ fontSize: 12, color: "#F59E0B", marginBottom: 14, background: "#F59E0B11", borderRadius: 6, padding: "8px 12px" }}>
              {diffResult.toAutoResolve.length} active policies not found in this report will be marked auto-resolved (they likely paid).
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={onCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadMsg && (
        <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 8, padding: "10px 14px", marginTop: 16, fontSize: 13, color: "#10B981" }}>
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

// ─── Trends Tab ──────────────────────────────────────────────────────────────

function TrendsTab({ trendsData }) {
  if (trendsData.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#334155", padding: "48px 0" }}>
        No data yet. Upload reports to see trends.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 16 }}>Monthly Cancel Volume & Save Rate</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252A3A" />
            <XAxis dataKey="month" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="left" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: "#1a1f2e", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12, color: "#E2E8F0" }}
              labelStyle={{ color: "#94A3B8" }}
              itemStyle={{ color: "#E2E8F0" }}
            />
            <Bar yAxisId="left" dataKey="cancels" name="Cancels" fill="#EF4444" radius={[4, 4, 0, 0]} opacity={0.7} />
            <Bar yAxisId="left" dataKey="saves" name="Saves" fill="#10B981" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="saveRate" name="Save Rate %" stroke="#F59E0B" strokeWidth={2} dot={{ fill: "#F59E0B", r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event, onClose, onUpdate, agencyId, currentEmployeeId, producers = [] }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const [saving, setSaving] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "" });
  const [form, setForm] = useState({
    status: event.status,
    assigned_to_id: event.assigned_to_id || "",
    contact_method: event.contact_method || "",
    promise_date: event.promise_date || "",
    termination_reason: event.termination_reason || "",
    notes: event.notes || "",
  });

  useEffect(() => {
    supabase
      .from("pending_cancel_attempts")
      .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
      .eq("pending_cancel_event_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    setLoggingAttempt(true);
    const { error } = await supabase.from("pending_cancel_attempts").insert({
      pending_cancel_event_id: event.id,
      agency_id: agencyId,
      employee_id: currentEmployeeId,
      method: attemptForm.method,
      result: attemptForm.result,
      note: attemptForm.note || null,
    });
    if (!error) {
      await supabase.from("pending_cancel_events").update({
        attempt_count: (event.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_attempt_result: attemptForm.result,
        ...(event.status === "pending" ? { status: "attempting" } : {}),
        ...(attemptForm.result === "left_voicemail" ? { status: "left_voicemail" } : {}),
        ...(attemptForm.result === "reached" ? { contacted_at: event.contacted_at || new Date().toISOString() } : {}),
      }).eq("id", event.id);
      const { data } = await supabase
        .from("pending_cancel_attempts")
        .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
        .eq("pending_cancel_event_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      setAttemptForm({ method: "phone", result: "no_answer", note: "" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  async function save() {
    setSaving(true);
    const updates = { ...form };
    if (["contacted","promise_to_pay","payment_plan_requested"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["saved","lost","requested_cancellation"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    // Sync assigned_to (legacy text) with assigned_to_id (employee FK)
    if (!updates.assigned_to_id) {
      updates.assigned_to_id = null;
      updates.assigned_to = null;
    } else {
      const rep = producers.find(p => p.id === updates.assigned_to_id);
      updates.assigned_to = rep
        ? (rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim())
        : null;
    }
    await onUpdate(event.id, updates);
    setSaving(false);
    onClose();
  }

  const ATTEMPT_RESULT_LABELS = {
    no_answer: "No Answer", left_voicemail: "Left Voicemail",
    reached: "Reached", wrong_number: "Wrong Number",
    busy: "Busy", disconnected: "Disconnected",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: 14, width: "100%", maxWidth: "98vw", height: "96vh", overflow: "auto", padding: "24px 20px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{maskCustomerName(event.customer_name) || "Unknown Customer"}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Policy {event.policy_no} · {event.product?.toUpperCase()} · Cycle {event.cycle}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {event.stage === 'cancelled' && (
          <div style={{ background: '#EF444411', border: '1px solid #EF444433',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444',
              textTransform: 'uppercase', marginBottom: 6 }}>
              🚫 Coverage Lapsed — Reinstatement Required
            </div>
            <div style={{ fontSize: 13, color: '#E2E8F0' }}>
              Amount to Reinstate:{' '}
              <strong style={{ color: '#F59E0B', fontFamily: "'DM Mono', monospace" }}>
                {event.amount_due ? `$${Number(event.amount_due).toLocaleString()}` : '—'}
              </strong>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              Customer must pay this amount to restore coverage before termination.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Cancel Date", value: event.cancel_effective_date, color: urgencyColor(days) },
            { label: "Days Left", value: days <= 0 ? "PAST DUE" : `${days} days`, color: urgencyColor(days) },
            { label: "Premium", value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "\u2014", color: "#E2E8F0" },
            { label: "Attempts", value: event.attempt_count || 0, color: (event.attempt_count || 0) >= 3 ? "#EF4444" : "#94A3B8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A" }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Attempt Log */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
              Attempt Log ({attempts.length})
            </div>
            <div style={{ background: "#1A1D27", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label>Method</label>
                  <select value={attemptForm.method} onChange={e => setAttemptForm(p => ({ ...p, method: e.target.value }))}>
                    <option value="phone">Phone</option>
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label>Result</label>
                  <select value={attemptForm.result} onChange={e => setAttemptForm(p => ({ ...p, result: e.target.value }))}>
                    <option value="no_answer">No Answer</option>
                    <option value="left_voicemail">Left Voicemail</option>
                    <option value="reached">Reached Customer</option>
                    <option value="wrong_number">Wrong Number</option>
                    <option value="busy">Busy</option>
                    <option value="disconnected">Disconnected</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                placeholder="Quick note (optional)"
                value={attemptForm.note}
                onChange={e => setAttemptForm(p => ({ ...p, note: e.target.value }))}
                style={{ width: "100%", marginBottom: 8 }}
              />
              <button
                className="btn-primary"
                onClick={logAttempt}
                disabled={loggingAttempt}
                style={{ width: "100%" }}
              >
                {loggingAttempt ? "Logging\u2026" : "+ Log Attempt"}
              </button>
            </div>
            {attempts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {attempts.map(a => {
                  const empName = a.employees
                    ? `${a.employees.first_name || ""} ${a.employees.last_name || ""}`.trim()
                    : "Unknown";
                  const resultLabel = ATTEMPT_RESULT_LABELS[a.result] || a.result;
                  const resultColor = a.result === "reached" ? "#10B981" : "#94A3B8";
                  return (
                    <div key={a.id} style={{ background: "#1A1D27", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: resultColor }}>{resultLabel}</span>
                        <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>via {a.method}</span>
                        {a.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{a.note}</div>}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", textAlign: "right" }}>
                        <div>{empName}</div>
                        <div>{new Date(a.attempted_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Only show status picker when customer has been reached */}
          {(event.status === "contacted" || attemptForm.result === "reached" ||
            ["contacted","payment_plan_requested","promise_to_pay","promise_broken","requested_cancellation"].includes(event.status)) && (
            <div>
              <label>Outcome (reached customer)</label>
              <select value={form.status} onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}>
                <option value="contacted">Contacted — no action yet</option>
                <option value="payment_plan_requested">Wants Payment Plan</option>
                <option value="promise_to_pay">Promised to Pay</option>
                <option value="saved">Saved ✓</option>
                <option value="requested_cancellation">Wants to Cancel</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div>
              <label>Assigned To</label>
              <select value={form.assigned_to_id} onChange={ev => setForm(p => ({ ...p, assigned_to_id: ev.target.value }))}>
                <option value="">Unassigned</option>
                {producers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.preferred_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Promise Date</label>
              <input type="date" value={form.promise_date}
                onChange={ev => setForm(p => ({ ...p, promise_date: ev.target.value }))} />
            </div>
          </div>

          {form.status === "requested_cancellation" && (
            <div>
              <label>Termination Reason</label>
              <select value={form.termination_reason}
                onChange={ev => setForm(p => ({ ...p, termination_reason: ev.target.value }))}>
                <option value="">— Select reason —</option>
                {TERMINATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <div>
            <label>Notes</label>
            <textarea value={form.notes}
              onChange={ev => setForm(p => ({ ...p, notes: ev.target.value }))}
              rows={3}
              style={{ width: "100%", background: "#1E2130", color: "#E2E8F0", border: "1px solid #2D3348", borderRadius: 6, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
              placeholder="Call notes, customer response..." />
          </div>

          <button className="btn-primary" onClick={save} disabled={saving} style={{ width: "100%" }}>
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lapse XLSX Parser ──────────────────────────────────────────────────────

function parseLapseXLSX(data) {
  const wb = XLSX.read(data, { type: "array" });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  if (allRows.length < 2) return [];

  // Scan first 10 rows for the header row (Format B has 5 metadata rows before headers)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const r = allRows[i].map(h => h?.toString().toLowerCase().trim());
    if (r.some(h => h?.includes("policy"))) { headerIdx = i; break; }
  }

  const headers = allRows[headerIdx].map(h => h?.toString().toLowerCase().trim());
  const rows = allRows.slice(headerIdx);
  const findLapseCol = (candidates) => headers.findIndex(h => candidates.some(c => h?.includes(c)));

  const iPolicy   = findLapseCol(["policy", "policy no", "policy number"]);
  const iCustomer = findLapseCol(["customer", "insured", "name"]);
  const iProduct  = findLapseCol(["product name", "line code", "product code", "product", "line of business", "lob"]);
  const iPremium  = findLapseCol(["premium new", "written premium", "annual premium", "premium"]);
  const iDate     = findLapseCol(["termination effective", "lapse date", "cancel date", "cancellation date", "eff date", "effective date"]);
  const iReason   = findLapseCol(["termination reason", "cancel reason", "reason"]);
  const iItems    = findLapseCol(["number of items", "no. of items", "item count", "items"]);

  // Products that are always 1 item per policy regardless of report value
  const SINGLE_ITEM_PRODUCTS = ["ho", "condo", "renters", "landlord", "pup", "manufactured", "boat", "motor_club"];

  return rows.slice(1).filter(r => r.some(Boolean)).map(r => {
    const productRaw = iProduct >= 0 ? r[iProduct]?.toString() ?? "" : "";
    const product = normaliseProduct(productRaw);

    const rawDate = iDate >= 0 ? r[iDate] : null;
    let lapseDate = null;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d)) lapseDate = d.toISOString().slice(0, 10);
    }

    const rawItemCount = iItems >= 0 ? parseInt(r[iItems]) || 1 : 1;
    const item_count = SINGLE_ITEM_PRODUCTS.includes(product) ? 1 : rawItemCount;

    return {
      policy_no:          iPolicy >= 0   ? r[iPolicy]?.toString().trim() ?? "" : "",
      customer_name:      iCustomer >= 0 ? r[iCustomer]?.toString().trim() ?? "" : "",
      product,
      product_raw:        productRaw,
      premium:            iPremium >= 0  ? parseFloat(r[iPremium]?.toString().replace(/[$,]/g, "")) || null : null,
      item_count,
      lapse_date:         lapseDate,
      termination_reason: iReason >= 0   ? r[iReason]?.toString().trim() ?? "" : "",
    };
  }).filter(r => r.policy_no);
}

// ─── Renewal XLSX Parser ────────────────────────────────────────────────────

// Allstate "Upcoming Renewals" / "Renewal Review" report parser
// Handles standard Dash export format
function parseRenewalXLSX(data) {
  const wb = XLSX.read(data, { type: "array" });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  if (allRows.length < 2) return [];

  // Scan first 10 rows for header
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const r = allRows[i].map(h => h?.toString().toLowerCase().trim());
    if (r.some(h => h?.includes("policy"))) { headerIdx = i; break; }
  }

  const headers = allRows[headerIdx].map(h => h?.toString().toLowerCase().trim());
  const rows = allRows.slice(headerIdx + 1);
  const findRenewalCol = (candidates) =>
    headers.findIndex(h => candidates.some(c => h?.includes(c)));

  const iPolicy    = findRenewalCol(["policy number", "policy no", "policy #", "pol no"]);
  const iCustomer  = findRenewalCol(["customer name", "insured name", "insured", "name", "customer"]);
  const iFirstName = findRenewalCol(["insured first name", "first name"]);
  const iLastName  = findRenewalCol(["insured last name", "last name"]);
  // Prefer "product name" (Col 13, readable text like "Homeowners") over "product code" (Col 12, numeric like "010")
  const iProductName = findRenewalCol(["product name"]);
  const iProductCode = findRenewalCol(["line code", "product code", "line of business", "lob"]);
  const iProduct     = iProductName >= 0 ? iProductName : (iProductCode >= 0 ? iProductCode : findRenewalCol(["product"]));
  const iPremium   = findRenewalCol(["renewal premium", "premium new", "written premium", "annual premium", "premium"]);
  const iRenewDate = findRenewalCol(["renewal anniversary date", "renewal anniversary", "anniversary date", "renewal date", "renewal effective", "policy renewal", "expiration date", "exp date"]);
  const iPhone     = findRenewalCol(["insured phone", "phone number", "phone", "mobile", "cell"]);
  const iEmail     = findRenewalCol(["insured email", "email address", "email"]);
  const iItems     = findRenewalCol(["no. of items", "item count", "items", "number of items"]);
  const iRenewalStatus = findRenewalCol(["renewal status"]);
  const iPremiumOld       = findRenewalCol(["premium old($)", "premium old", "prior premium", "previous premium"]);
  const iPremiumChange    = findRenewalCol(["premium change($)", "premium change(", "change($)", "prem change"]);
  const iPremiumChangePct = findRenewalCol(["premium change(%)", "change(%)", "pct change", "% change"]);
  const iOriginalYear     = findRenewalCol(["original year", "orig year", "policy year"]);
  const iPriorYears       = findRenewalCol(["years prior insurance", "years prior", "prior years"]);
  const iEasyPay          = findRenewalCol(["easy pay", "easypay", "autopay"]);
  const iMultiLine        = findRenewalCol(["multi-line indicator", "multi line indicator", "multiline indicator", "multi-line", "multi line"]);

  return rows.filter(r => r.some(Boolean)).map(r => {
    const policyNo = iPolicy >= 0 ? r[iPolicy]?.toString().trim() : null;
    if (!policyNo) return null;

    const productRaw = iProduct >= 0 ? r[iProduct]?.toString() ?? "" : "";
    const product = normaliseProduct(productRaw);

    let renewalDate = null;
    if (iRenewDate >= 0 && r[iRenewDate]) {
      const raw = r[iRenewDate];
      if (raw instanceof Date) {
        renewalDate = raw.toISOString().slice(0, 10);
      } else {
        const parsed = new Date(raw);
        if (!isNaN(parsed)) renewalDate = parsed.toISOString().slice(0, 10);
      }
    }
    if (!renewalDate) return null;

    const premiumRaw = iPremium >= 0 ? r[iPremium] : null;
    const premium = premiumRaw ? parseFloat(String(premiumRaw).replace(/[^0-9.]/g, "")) || null : null;

    const itemsRaw = iItems >= 0 ? parseInt(r[iItems]) : null;
    const itemCount = !isNaN(itemsRaw) && itemsRaw > 0 ? itemsRaw : 1;

    // Build full customer name: prefer first+last columns, fall back to single name column
    let customerName = null;
    if (iFirstName >= 0 && iLastName >= 0) {
      const first = r[iFirstName]?.toString().trim() || "";
      const last  = r[iLastName]?.toString().trim() || "";
      customerName = `${first} ${last}`.trim() || null;
    } else if (iCustomer >= 0) {
      customerName = r[iCustomer]?.toString().trim() || null;
    }

    return {
      policy_no:    policyNo,
      customer_name: customerName,
      product,
      product_raw:  productRaw,
      premium,
      item_count:   itemCount,
      renewal_date: renewalDate,
      phone:        iPhone >= 0 ? r[iPhone]?.toString().trim() || null : null,
      email:        iEmail >= 0 ? r[iEmail]?.toString().trim() || null : null,
      renewal_status: iRenewalStatus >= 0 ? r[iRenewalStatus]?.toString().trim() || null : null,
      premium_old:        iPremiumOld >= 0 ? parseFloat(String(r[iPremiumOld]).replace(/[^0-9.-]/g, "")) || null : null,
      premium_change:     iPremiumChange >= 0 ? parseFloat(String(r[iPremiumChange]).replace(/[^0-9.-]/g, "")) || null : null,
      premium_change_pct: iPremiumChangePct >= 0 ? parseFloat(String(r[iPremiumChangePct]).replace(/[^0-9.-]/g, "")) || null : null,
      original_year:      iOriginalYear >= 0 ? parseInt(r[iOriginalYear]) || null : null,
      years_prior:        iPriorYears >= 0 ? parseInt(r[iPriorYears]) || null : null,
      easy_pay:           iEasyPay >= 0 ? (r[iEasyPay]?.toString().trim().toUpperCase() === "Y") : null,
      multi_line:         iMultiLine >= 0 ? (r[iMultiLine]?.toString().trim() || null) : null,
    };
  }).filter(Boolean);
}

// ─── Renewal Status Config ──────────────────────────────────────────────────

const RENEWAL_STATUS_CONFIG = {
  pending:          { label: "Pending",          color: "#94A3B8", bg: "#F1F5F9" },
  attempting:       { label: "Attempting",       color: "#F59E0B", bg: "#FEF3C7" },
  left_voicemail:   { label: "Left Voicemail",   color: "#F59E0B", bg: "#FEF3C7" },
  review_requested: { label: "Review Requested", color: "#3B82F6", bg: "#DBEAFE" },
  shopping:         { label: "Shopping",         color: "#EF4444", bg: "#FEE2E2" },
  confirmed:        { label: "Confirmed ✓", color: "#10B981", bg: "#D1FAE5" },
  at_risk:          { label: "At Risk",          color: "#EF4444", bg: "#FEE2E2" },
  escalated:        { label: "Escalated",        color: "#8B5CF6", bg: "#EDE9FE" },
  lost:             { label: "Lost",             color: "#6B7280", bg: "#F3F4F6" },
  unreachable:      { label: "Unreachable",      color: "#64748B", bg: "#F1F5F9" },
  auto_resolved:    { label: "Auto-Resolved",    color: "#94A3B8", bg: "#F1F5F9" },
};

const RENEWAL_CONTACT_METHODS = ["phone", "text", "email", "other"];

function daysUntilRenewal(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

function renewalUrgencyColor(days) {
  if (days < 7) return "#EF4444";
  if (days <= 21) return "#F59E0B";
  return "#10B981";
}

// ─── Priority Score ─────────────────────────────────────────────────────────
// calcRenewalPriority and calcCancelPriority imported from ../lib/retentionPriority

// ─── Renewal Detail Modal ───────────────────────────────────────────────────

function RenewalDetailModal({ event, onClose, onUpdate, producers, agencyId, currentEmployeeId }) {
  const days = daysUntilRenewal(event.renewal_date);
  const [saving, setSaving] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [attemptForm, setAttemptForm] = useState({ method: "phone", result: "no_answer", note: "" });
  const [form, setForm] = useState({
    status: event.status,
    assigned_to_id: event.assigned_to_id || "",
    contact_method: event.contact_method || "",
    notes: event.notes || "",
    shopping_reason: event.shopping_reason || "",
  });

  useEffect(() => {
    supabase
      .from("renewal_attempts")
      .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
      .eq("renewal_event_id", event.id)
      .order("attempted_at", { ascending: false })
      .then(({ data }) => setAttempts(data || []));
  }, [event.id]);

  async function logAttempt() {
    setLoggingAttempt(true);
    const { error } = await supabase.from("renewal_attempts").insert({
      renewal_event_id: event.id,
      agency_id: agencyId,
      employee_id: currentEmployeeId,
      method: attemptForm.method,
      result: attemptForm.result,
      note: attemptForm.note || null,
    });
    if (!error) {
      const newCount = (event.attempt_count || 0) + 1;
      const statusUpdate = {};
      if (event.status === "pending") statusUpdate.status = "attempting";
      if (attemptForm.result === "left_voicemail") statusUpdate.status = "left_voicemail";
      if (attemptForm.result === "reached") statusUpdate.contacted_at = event.contacted_at || new Date().toISOString();
      // Suggest unreachable after 3+ non-reached attempts
      if (newCount >= 3 && attemptForm.result !== "reached" && event.status === "attempting") {
        // Don't auto-set, just leave as attempting — auto-unreachable handles at 5+
      }

      await supabase.from("renewal_events").update({
        attempt_count: newCount,
        last_attempt_at: new Date().toISOString(),
        last_attempt_result: attemptForm.result,
        ...statusUpdate,
      }).eq("id", event.id);

      const { data } = await supabase
        .from("renewal_attempts")
        .select("id, attempted_at, method, result, note, employees(first_name, last_name)")
        .eq("renewal_event_id", event.id)
        .order("attempted_at", { ascending: false });
      setAttempts(data || []);
      setAttemptForm({ method: "phone", result: "no_answer", note: "" });
      await onUpdate(event.id, {});
    }
    setLoggingAttempt(false);
  }

  async function save() {
    setSaving(true);
    const updates = { ...form };
    if (["review_requested","confirmed","at_risk","shopping","escalated"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["confirmed","lost"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    if (!updates.assigned_to_id) updates.assigned_to_id = null;
    if (form.status !== "shopping") updates.shopping_reason = null;
    await onUpdate(event.id, updates);
    setSaving(false);
    onClose();
  }

  const ATTEMPT_RESULT_LABELS = {
    no_answer: "No Answer", left_voicemail: "Left Voicemail",
    reached: "Reached", wrong_number: "Wrong Number",
    busy: "Busy", disconnected: "Disconnected",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: 14, width: "100%", maxWidth: "98vw", height: "96vh", overflow: "auto", padding: "24px 20px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{maskCustomerName(event.customer_name) || "Unknown Customer"}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Policy {event.policy_no} · {event.product?.toUpperCase()}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Policy No",     value: event.policy_no },
            { label: "Product",       value: event.product_raw || event.product?.toUpperCase() },
            { label: "Renewal Date",  value: event.renewal_date, color: renewalUrgencyColor(days) },
            { label: "Days Until",    value: days <= 0 ? "PAST DUE" : `${days} days`, color: renewalUrgencyColor(days) },
            { label: "Premium",       value: event.premium ? fmtFull$(event.premium) : "\u2014" },
            { label: "Prior Premium", value: event.premium_old ? fmtFull$(event.premium_old) : "\u2014" },
            { label: "Premium \u0394",     value: event.premium_change != null
                ? `${event.premium_change > 0 ? "+" : ""}${fmtFull$(event.premium_change)}`
                : "\u2014",
              color: event.premium_change == null ? "#94A3B8"
                : event.premium_change > 0 ? "#EF4444" : "#10B981" },
            { label: "Easy Pay",      value: event.easy_pay === true ? "Yes ✓" : event.easy_pay === false ? "No" : "—" },
            { label: "Multi-Line",
              value: event.multi_line === 'Yes' ? 'Yes — Bundled'
                   : event.multi_line === 'No'  ? 'No — Monoline'
                   : '—',
              color: event.multi_line === 'Yes' ? '#10B981'
                   : event.multi_line === 'No'  ? '#60A5FA'
                   : '#64748B' },
            { label: "Tenure",        value: event.original_year
                ? `${CURRENT_YEAR - event.original_year} yrs (${event.original_year})`
                : "\u2014" },
            { label: "Priority",      value: String(event._priority ?? calcRenewalPriority(event)) },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A" }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: color || "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>{value || "\u2014"}</div>
            </div>
          ))}
        </div>

        {/* Contact info */}
        <div style={{ background: "#1A1D27", borderRadius: 8, padding: "12px 14px", marginBottom: 16, border: "1px solid #252A3A" }}>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "#475569" }}>Phone</div>
              <div style={{ fontSize: 13, color: "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>{event.phone || "\u2014"}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#475569" }}>Email</div>
              <div style={{ fontSize: 13, color: "#94A3B8" }}>{event.email || "\u2014"}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Attempt Log */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
              Attempt Log ({attempts.length})
            </div>
            <div style={{ background: "#1A1D27", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <label>Method</label>
                  <select value={attemptForm.method} onChange={e => setAttemptForm(p => ({ ...p, method: e.target.value }))}>
                    <option value="phone">Phone</option>
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label>Result</label>
                  <select value={attemptForm.result} onChange={e => setAttemptForm(p => ({ ...p, result: e.target.value }))}>
                    <option value="no_answer">No Answer</option>
                    <option value="left_voicemail">Left Voicemail</option>
                    <option value="reached">Reached Customer</option>
                    <option value="wrong_number">Wrong Number</option>
                    <option value="busy">Busy</option>
                    <option value="disconnected">Disconnected</option>
                  </select>
                </div>
              </div>
              <input
                type="text"
                placeholder="Quick note (optional)"
                value={attemptForm.note}
                onChange={e => setAttemptForm(p => ({ ...p, note: e.target.value }))}
                style={{ width: "100%", marginBottom: 8 }}
              />
              <button
                className="btn-primary"
                onClick={logAttempt}
                disabled={loggingAttempt}
                style={{ width: "100%" }}
              >
                {loggingAttempt ? "Logging\u2026" : "+ Log Attempt"}
              </button>
            </div>
            {attempts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {attempts.map(a => {
                  const empName = a.employees
                    ? `${a.employees.first_name || ""} ${a.employees.last_name || ""}`.trim()
                    : "Unknown";
                  const resultLabel = ATTEMPT_RESULT_LABELS[a.result] || a.result;
                  const resultColor = a.result === "reached" ? "#10B981" : "#94A3B8";
                  return (
                    <div key={a.id} style={{ background: "#1A1D27", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: resultColor }}>{resultLabel}</span>
                        <span style={{ fontSize: 11, color: "#64748B", marginLeft: 8 }}>via {a.method}</span>
                        {a.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{a.note}</div>}
                      </div>
                      <div style={{ fontSize: 11, color: "#475569", textAlign: "right" }}>
                        <div>{empName}</div>
                        <div>{new Date(a.attempted_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outcome picker — only when reached */}
          {(attemptForm.result === "reached" ||
            ["review_requested","shopping","at_risk","escalated","confirmed"].includes(event.status)) && (
            <div>
              <label>Outcome (reached customer)</label>
              <select value={form.status} onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}>
                <option value="confirmed">Confirmed Renewal ✓</option>
                <option value="review_requested">Wants Policy Review</option>
                <option value="shopping">Shopping Competitors</option>
                <option value="at_risk">At Risk (payment/unhappy)</option>
                <option value="escalated">Escalate to Agent</option>
                <option value="lost">Lost — Won't Renew</option>
              </select>
            </div>
          )}

          {form.status === "shopping" && (
            <div>
              <label>Shopping Reason</label>
              <select value={form.shopping_reason} onChange={ev => setForm(p => ({ ...p, shopping_reason: ev.target.value }))}>
                <option value="">— Select —</option>
                <option value="price">Price too high</option>
                <option value="coverage">Coverage concerns</option>
                <option value="service">Service experience</option>
                <option value="life_event">Life event (moving, etc.)</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          <div>
            <label>Assigned To</label>
            <select value={form.assigned_to_id} onChange={ev => setForm(p => ({ ...p, assigned_to_id: ev.target.value }))}>
              <option value="">Unassigned</option>
              {producers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.preferred_name || `${p.first_name || ""} ${p.last_name || ""}`.trim()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Notes</label>
            <textarea value={form.notes}
              onChange={ev => setForm(p => ({ ...p, notes: ev.target.value }))}
              rows={3}
              style={{ width: "100%", background: "#1E2130", color: "#E2E8F0", border: "1px solid #2D3348", borderRadius: 6, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
              placeholder="Call notes, customer response..." />
          </div>

          <button className="btn-primary" onClick={save} disabled={saving} style={{ width: "100%" }}>
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Renewal Tab ────────────────────────────────────────────────────────────

function RenewalTab({ agencyId, currentUserId, currentEmployeeId }) {
  const queryClient = useQueryClient();
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [sortCol, setSortCol] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");
  const [myCasesOnly, setMyCasesOnly] = useState(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [parsedRows, setParsedRows] = useState(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const fileInputRef = useRef(null);

  // Load renewal events
  const { data: renewalEvents = [], isLoading: loading } = useQuery({
    queryKey: ["renewal_events", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_events")
        .select("*")
        .eq("agency_id", agencyId)
        .order("renewal_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // Load producers (service employees)
  const { data: producers = [] } = useQuery({
    queryKey: ["producers", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .contains("roles", ["service"])
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // Auto-flag unreachable: 5+ attempts with no reached result, past renewal date
  const hasFlaggedUnreachable = useRef(false);
  useEffect(() => {
    if (hasFlaggedUnreachable.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const toFlag = renewalEvents.filter(e =>
      e.status === "attempting" &&
      e.attempt_count >= 5 &&
      e.renewal_date <= today
    );
    if (toFlag.length === 0) return;
    hasFlaggedUnreachable.current = true;
    Promise.all(
      toFlag.map(e =>
        supabase.from("renewal_events")
          .update({ status: "unreachable" })
          .eq("id", e.id)
      )
    ).then(() => queryClient.invalidateQueries({ queryKey: ["renewal_events", agencyId] }));
  }, [renewalEvents, agencyId, queryClient]);

  const employeeMap = useMemo(() => {
    const m = {};
    producers.forEach(p => { m[p.id] = p.preferred_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(); });
    return m;
  }, [producers]);

  // Filter & sort
  const filteredRenewals = useMemo(() => {
    let list = [...renewalEvents];
    if (statusFilter === "active") {
      list = list.filter(e => !["confirmed","lost","auto_resolved","unreachable"].includes(e.status));
    } else if (statusFilter === "attempting") {
      list = list.filter(e => ["attempting","left_voicemail"].includes(e.status));
    } else if (statusFilter === "reached") {
      list = list.filter(e => ["review_requested","shopping","at_risk","escalated"].includes(e.status));
    } else if (statusFilter === "shopping") {
      list = list.filter(e => e.status === "shopping");
    } else if (statusFilter === "confirmed") {
      list = list.filter(e => e.status === "confirmed");
    } else if (statusFilter === "lost") {
      list = list.filter(e => ["lost","unreachable"].includes(e.status));
    }

    const withScores = list.map(e => ({ ...e, _priority: calcRenewalPriority(e) }));

    return withScores.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "priority": av = a._priority; bv = b._priority; break;
        case "renewal_date": av = a.renewal_date; bv = b.renewal_date; break;
        case "customer_name": av = a.customer_name || ""; bv = b.customer_name || ""; break;
        case "premium": av = a.premium || 0; bv = b.premium || 0; break;
        case "premium_change": av = a.premium_change || 0; bv = b.premium_change || 0; break;
        case "premium_change_pct": av = a.premium_change_pct || 0; bv = b.premium_change_pct || 0; break;
        case "status": av = a.status; bv = b.status; break;
        case "days_until": av = daysUntilRenewal(a.renewal_date); bv = daysUntilRenewal(b.renewal_date); break;
        case "product": av = a.product || ""; bv = b.product || ""; break;
        case "multi_line": av = a.multi_line || ""; bv = b.multi_line || ""; break;
        case "attempt_count": av = a.attempt_count || 0; bv = b.attempt_count || 0; break;
        case "assigned_to": av = employeeMap[a.assigned_to_id] || ""; bv = employeeMap[b.assigned_to_id] || ""; break;
        case "contact_method": av = a.contact_method || ""; bv = b.contact_method || ""; break;
        default: av = a._priority; bv = b._priority;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [renewalEvents, statusFilter, sortCol, sortDir, employeeMap]);

  const displayRenewals = myCasesOnly && currentEmployeeId
    ? filteredRenewals.filter(e => e.assigned_to_id === currentEmployeeId)
    : filteredRenewals;

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  async function updateRenewalEvent(id, updates) {
    const { error } = await supabase
      .from("renewal_events")
      .update(updates)
      .eq("id", id);
    if (!error) {
      queryClient.setQueryData(["renewal_events", agencyId], (prev) =>
        (prev ?? []).map(e => e.id === id ? { ...e, ...updates } : e)
      );
    }
    return error;
  }

  // Upload flow
  async function handleFileSelect(file) {
    if (!file) return;
    setUploadFile(file);
    setUploadError("");
    setUploadMsg("");
    setParsedRows(null);
    setExcludedCount(0);
    setIsParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseRenewalXLSX(new Uint8Array(buf));
      if (rows.length === 0) {
        setUploadError("No valid rows found. Check that the file has Policy No and Renewal Date columns.");
        return;
      }
      // Filter to actionable rows — only "Renewal Not Taken" (or rows without a renewal_status column)
      const hasStatusCol = rows.some(r => r.renewal_status);
      if (hasStatusCol) {
        const actionable = rows.filter(r => !r.renewal_status || r.renewal_status === "Renewal Not Taken");
        const excluded = rows.length - actionable.length;
        setExcludedCount(excluded);
        if (actionable.length === 0) {
          setUploadError(`All ${rows.length} rows are already renewed or not applicable. No actionable rows to import.`);
          return;
        }
        setParsedRows(actionable);
      } else {
        setExcludedCount(0);
        setParsedRows(rows);
      }
    } catch (err) {
      console.error("[renewal parse error]", err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCommit() {
    if (!parsedRows || !agencyId || isCommitting) return;
    setIsCommitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Find existing rows (for upsert dedup)
      const policyNos = parsedRows.map(r => r.policy_no);
      const { data: existing } = await supabase
        .from("renewal_events")
        .select("policy_no, renewal_date")
        .eq("agency_id", agencyId)
        .in("policy_no", policyNos);
      const existingKeys = new Set((existing ?? []).map(e => `${e.policy_no}|${e.renewal_date}`));

      const toAdd = parsedRows.filter(r => !existingKeys.has(`${r.policy_no}|${r.renewal_date}`));
      const updatedCount = parsedRows.length - toAdd.length;

      // 2. Load all active service reps
      const { data: reps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .contains("roles", ["service"])
        .order("last_name");

      const activeReps = reps || [];
      const assignmentQueue = [...activeReps];

      // 3. Build assignment rotation — seed with existing caseloads for balanced distribution
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from("renewal_events")
          .select("assigned_to_id")
          .eq("agency_id", agencyId)
          .not("assigned_to_id", "is", null)
          .not("status", "in", '("confirmed","lost","auto_resolved","unreachable")');

        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) {
            runningCount[c.assigned_to_id]++;
          }
        });
      }

      function pickNextRep() {
        if (assignmentQueue.length === 0) return null;
        const sorted = [...assignmentQueue].sort(
          (a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0)
        );
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked.id;
      }

      // 4. Create upload record
      const { data: upload, error: upErr } = await supabase
        .from("renewal_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: currentUserId,
          filename: uploadFile?.name ?? "unknown",
          rows_added: toAdd.length,
          rows_updated: updatedCount,
          committed: false,
        })
        .select("id")
        .single();
      if (upErr) throw new Error(upErr.message);

      // 5. Insert new rows (with assignment) and update existing rows separately
      //    Mixing them in a single upsert causes PostgREST to normalize columns,
      //    which either drops assigned_to_id on new rows or nullifies it on existing rows.
      const newRecords = toAdd.map(r => {
        const assignedId = pickNextRep();
        return {
          agency_id: agencyId,
          upload_batch_id: upload.id,
          first_seen_on: today,
          last_seen_on: today,
          ...(assignedId ? { assigned_to_id: assignedId } : {}),
          ...r,
        };
      });

      const existingRows = parsedRows.filter(r => existingKeys.has(`${r.policy_no}|${r.renewal_date}`));
      const updateRecords = existingRows.map(r => ({
        agency_id: agencyId,
        upload_batch_id: upload.id,
        first_seen_on: today,
        last_seen_on: today,
        ...r,
      }));

      if (newRecords.length > 0) {
        const { error: insErr } = await supabase
          .from("renewal_events")
          .insert(newRecords);
        if (insErr) throw new Error(insErr.message);
      }

      if (updateRecords.length > 0) {
        const { error: updErr } = await supabase
          .from("renewal_events")
          .upsert(updateRecords, { onConflict: "agency_id,policy_no,renewal_date" });
        if (updErr) throw new Error(updErr.message);
      }

      await supabase.from("renewal_uploads").update({ committed: true }).eq("id", upload.id);

      // 6. Build summary message
      const repNames = assignmentQueue.map(r =>
        r.preferred_name || `${r.first_name || ""} ${r.last_name || ""}`.trim()
      );
      const assignmentSummary = activeReps.length === 0
        ? "No service reps found — cases unassigned"
        : activeReps.length === 1
        ? `All assigned to ${repNames[0]}`
        : `Distributed across ${repNames.join(", ")}`;

      setUploadMsg(`${toAdd.length} added · ${updatedCount} updated · ${assignmentSummary}`);
      setParsedRows(null);
      setExcludedCount(0);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ["renewal_events", agencyId] });
      queryClient.invalidateQueries({ queryKey: ["policy_retention_status", agencyId] });
    } catch (err) {
      console.error("[renewal commit error]", err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div>
      {/* Upload Section */}
      <div style={{ maxWidth: 640, marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          Upload the Allstate <span style={{ fontFamily: "'DM Mono', monospace" }}>Renewal Review</span> report (XLSX).
        </div>

        <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }}
            onChange={e => handleFileSelect(e.target.files[0])} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83D\uDCC4"}</div>
          <div style={{ fontSize: 14, color: "#94A3B8", fontWeight: 500 }}>
            {uploadFile ? uploadFile.name : "Drop renewal report here or click to browse"}
          </div>
          {isParsing && <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>Parsing{"\u2026"}</div>}
        </div>

        {/* Assignment info — shown after parsing, before commit */}
        {parsedRows && producers.length > 0 && (
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 12, marginBottom: 12 }}>
            {producers.length === 1
              ? `All new cases will be assigned to ${producers[0].preferred_name || producers[0].first_name}`
              : `New cases will be distributed across ${producers.length} service reps (workload-balanced)`
            }
          </div>
        )}
        {parsedRows && producers.length === 0 && (
          <div style={{ fontSize: 12, color: "#F59E0B", marginTop: 12, marginBottom: 12 }}>
            {"\u26A0"} No active service reps found — cases will be unassigned
          </div>
        )}

        {uploadError && (
          <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#EF4444" }}>
            {uploadError}
          </div>
        )}

        {parsedRows && !uploadMsg && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 12 }}>
              Preview — {parsedRows.length} actionable rows
              {excludedCount > 0 && (
                <span style={{ fontWeight: 400, fontSize: 12, color: "#64748B", marginLeft: 8 }}>
                  ({excludedCount} already renewed excluded)
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" onClick={handleCommit} disabled={isCommitting}>
                {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
              </button>
              <button className="btn-ghost" onClick={() => { setParsedRows(null); setExcludedCount(0); setUploadFile(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {uploadMsg && (
          <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#10B981" }}>
            {uploadMsg}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap", rowGap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "active", label: "Active" },
            { key: "attempting", label: "Attempting" },
            { key: "reached", label: "Reached" },
            { key: "shopping", label: "Shopping" },
            { key: "all", label: "All" },
            { key: "confirmed", label: "Confirmed" },
            { key: "lost", label: "Lost" },
          ].map(f => (
            <button key={f.key} className={`btn-ghost ${statusFilter === f.key ? "active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
              style={{ padding: "5px 12px", fontSize: 12 }}>
              {f.label}
            </button>
          ))}
        </div>
        {currentEmployeeId && (
          <button
            onClick={() => setMyCasesOnly(v => !v)}
            className={`btn-ghost ${myCasesOnly ? 'active' : ''}`}
            style={{ fontSize: 12, marginLeft: 'auto' }}
          >
            {"\uD83D\uDC64"} My Cases
            {myCasesOnly && ` (${displayRenewals.length})`}
          </button>
        )}
      </div>

      {loading && <div style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>Loading renewals{"\u2026"}</div>}

      {/* Triage Table */}
      <div className="scroll-hint-container">
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <SortTh col="priority" label="Priority" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="customer_name" label="Customer" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="product" label="Product" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="multi_line" label="Multi" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="premium" label="Premium" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="premium_change" label="Prem \u0394" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="premium_change_pct" label="\u0394%" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="renewal_date" label="Renewal Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="days_until" label="Days Until" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="attempt_count" label="Attempts" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="assigned_to" label="Assigned" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="contact_method" label="Contact" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {displayRenewals.map(event => {
                const days = daysUntilRenewal(event.renewal_date);
                const sc = RENEWAL_STATUS_CONFIG[event.status] || RENEWAL_STATUS_CONFIG.pending;
                return (
                  <tr key={event.id} className="triage-row" onClick={() => setSelectedRenewal(event)}>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                        background: event._priority >= 80 ? "#EF444422"
                                  : event._priority >= 55 ? "#F59E0B22"
                                  : event._priority >= 30 ? "#3B82F622"
                                  : "#64748B22",
                        color: event._priority >= 80 ? "#EF4444"
                             : event._priority >= 55 ? "#F59E0B"
                             : event._priority >= 30 ? "#3B82F6"
                             : "#64748B",
                      }}>
                        {event._priority}
                      </span>
                    </td>
                    <td style={{ color: "#E2E8F0", fontWeight: 600, fontSize: 13 }}>
                      {maskCustomerName(event.customer_name)}
                    </td>
                    <td style={{ color: "#94A3B8", fontSize: 12 }}>{event.product?.toUpperCase() || "\u2014"}</td>
                    <td>
                      {event.multi_line === 'Yes' ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                          fontSize: 10, fontWeight: 700,
                          background: '#10B98122', color: '#10B981',
                        }}>ML</span>
                      ) : event.multi_line === 'No' ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                          fontSize: 10, fontWeight: 700,
                          background: '#3B82F622', color: '#60A5FA',
                        }}>SL</span>
                      ) : (
                        <span style={{ color: '#334155', fontSize: 11 }}>{"\u2014"}</span>
                      )}
                    </td>
                    <td style={{ color: "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>
                      {event.premium ? fmtFull$(event.premium) : "\u2014"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12,
                      color: event.premium_change == null ? "#64748B"
                        : event.premium_change > 0 ? "#EF4444"
                        : "#10B981" }}>
                      {event.premium_change != null
                        ? `${event.premium_change > 0 ? "+" : ""}${fmtFull$(event.premium_change)}`
                        : "\u2014"}
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 11,
                      color: event.premium_change_pct == null ? "#64748B"
                        : event.premium_change_pct > 0 ? "#EF4444"
                        : "#10B981" }}>
                      {event.premium_change_pct != null
                        ? `${event.premium_change_pct > 0 ? "+" : ""}${event.premium_change_pct.toFixed(1)}%`
                        : "\u2014"}
                    </td>
                    <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      {event.renewal_date}
                    </td>
                    <td>
                      <span className="urgency-badge" style={{ background: `${renewalUrgencyColor(days)}22`, color: renewalUrgencyColor(days) }}>
                        {days <= 0 ? "PAST DUE" : `${days}d`}
                      </span>
                    </td>
                    <td style={{ color: (event.attempt_count || 0) >= 3 ? "#EF4444" : "#64748B", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                      {event.attempt_count || 0}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </td>
                    <td style={{ color: "#64748B", fontSize: 12 }}>{employeeMap[event.assigned_to_id] || "\u2014"}</td>
                    <td style={{ color: "#64748B", fontSize: 12 }}>{event.contact_method || "\u2014"}</td>
                  </tr>
                );
              })}
              {displayRenewals.length === 0 && (
                <tr><td colSpan={12} style={{ textAlign: "center", color: "#334155", padding: "32px 0" }}>
                  No renewal events in this filter
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRenewal && createPortal(
        <RenewalDetailModal
          event={selectedRenewal}
          onClose={() => setSelectedRenewal(null)}
          onUpdate={updateRenewalEvent}
          producers={producers}
          agencyId={agencyId}
          currentEmployeeId={currentEmployeeId}
        />,
        document.body
      )}
    </div>
  );
}

// ─── Attrition Tab ──────────────────────────────────────────────────────────

function AttritionTab({ agencyId, currentUserId }) {
  const [lapseFile, setLapseFile] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    // Default to first day of current month
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [parsedRows, setParsedRows] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [parseError, setParseError] = useState("");
  const queryClient = useQueryClient();
  const lapseFileRef = useRef();

  // Monthly summary data — React Query cache survives unmount/remount
  const { data: monthlySummary = [], isLoading: loading } = useQuery({
    queryKey: ["lapse_events_summary", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lapse_events")
        .select("report_month, product, premium, item_count")
        .eq("agency_id", agencyId)
        .order("report_month", { ascending: false });

      if (error) throw error;

      const byMonth = {};
      (data ?? []).forEach(r => {
        const m = r.report_month;
        if (!byMonth[m]) byMonth[m] = { report_month: m, items: 0, points: 0, premium: 0 };
        byMonth[m].items += r.item_count ?? 1;
        byMonth[m].points += (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
        byMonth[m].premium += r.premium ?? 0;
      });
      return Object.values(byMonth).sort((a, b) => b.report_month.localeCompare(a.report_month));
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLapseFile(file);
    setParseError("");
    setParsedRows(null);
    setCommitMsg("");
    try {
      const buf = await file.arrayBuffer();
      const rows = parseLapseXLSX(new Uint8Array(buf));
      if (rows.length === 0) { setParseError("No valid rows found. Check that your file has a Policy No column."); return; }
      setParsedRows(rows);
    } catch (err) {
      console.error("[attrition parse error]", err.message);
      setParseError(`❌ ${friendlyUploadError(err.message)}`);
    }
  }

  async function handleCommit() {
    if (!parsedRows || !agencyId) return;
    if (!currentUserId) {
      setParseError("Session expired. Please refresh and try again.");
      return;
    }
    setIsCommitting(true);
    try {
      // Count existing rows for this month to distinguish inserts vs updates
      const policyNos = parsedRows.map(r => r.policy_no);
      const { data: existing } = await supabase
        .from("lapse_events")
        .select("policy_no")
        .eq("agency_id", agencyId)
        .eq("report_month", reportMonth)
        .in("policy_no", policyNos);
      const existingCount = existing?.length ?? 0;
      const newCount = parsedRows.length - existingCount;

      // Create upload record first
      const { data: upload, error: upErr } = await supabase
        .from("lapse_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: currentUserId,
          filename: lapseFile?.name ?? "unknown",
          report_month: reportMonth,
          rows_added: newCount,
          rows_updated: existingCount,
          committed: false,
        })
        .select("id")
        .single();
      if (upErr) throw new Error(upErr.message);

      // Upsert events
      const records = parsedRows.map(r => ({
        agency_id: agencyId,
        report_month: reportMonth,
        upload_batch_id: upload.id,
        ...r,  // includes item_count from parser
      }));

      const { error: evtErr } = await supabase
        .from("lapse_events")
        .upsert(records, { onConflict: "agency_id,policy_no,report_month" });
      if (evtErr) throw new Error(evtErr.message);

      // Mark upload committed
      await supabase.from("lapse_uploads").update({ committed: true }).eq("id", upload.id);

      const monthLabel = new Date(reportMonth).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      const msg = existingCount > 0
        ? `✅ ${newCount} ${newCount === 1 ? "record" : "records"} added · ${existingCount} updated for ${monthLabel}.`
        : `✅ ${parsedRows.length} attrition ${parsedRows.length === 1 ? "record" : "records"} loaded for ${monthLabel}.`;
      setCommitMsg(msg);
      setParsedRows(null);
      setLapseFile(null);
      queryClient.invalidateQueries({ queryKey: ["lapse_events_summary", agencyId] });
    } catch (err) {
      console.error("[attrition commit error]", err.message);
      setParseError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCommitting(false);
    }
  }

  // Gap analysis: compare consecutive months
  // For each month, the "gap" is items/points lost. The following month must exceed it.
  const gapAnalysis = useMemo(() => {
    if (monthlySummary.length < 2) return null;
    const [current, prior] = monthlySummary; // sorted desc, so [0] = most recent

    // Check if the most recent report_month is the current calendar month
    const now = new Date();
    const currentCalendarMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isPartialMonth = current.report_month.slice(0, 7) === currentCalendarMonth;

    // Calculate how many days into the month we are
    const daysIntoMonth = now.getDate();

    return {
      currentMonth: current.report_month.slice(0, 7),
      priorMonth: prior.report_month.slice(0, 7),
      priorItems: prior.items,
      priorPoints: prior.points,
      currentItems: current.items,
      currentPoints: current.points,
      itemsDelta: current.items - prior.items,
      pointsDelta: current.points - prior.points,
      isPartialMonth,
      daysIntoMonth,
    };
  }, [monthlySummary]);

  const preview = parsedRows ? {
    items: parsedRows.reduce((s, r) => s + (r.item_count ?? 1), 0),
    points: calcLapsePoints(parsedRows),
    premium: parsedRows.reduce((s, r) => s + (r.premium ?? 0), 0),
    byProduct: parsedRows.reduce((acc, r) => {
      acc[r.product] = (acc[r.product] || 0) + 1;
      return acc;
    }, {}),
  } : null;

  return (
    <div>
      {/* Gap Alert Banner */}
      {gapAnalysis && (
        <div style={{ background: gapAnalysis.pointsDelta > 0 ? "#EF444411" : "#10B98111", border: `1px solid ${gapAnalysis.pointsDelta > 0 ? "#EF444433" : "#10B98133"}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: gapAnalysis.pointsDelta > 0 ? "#EF4444" : "#10B981", marginBottom: 4 }}>
            {gapAnalysis.pointsDelta > 0
              ? `⚠ Attrition increased — ${gapAnalysis.currentMonth}: ${gapAnalysis.currentPoints} pts lost · New business must exceed this next month to grow`
              : `✓ Attrition decreased vs prior month`}
          </div>
          <div style={{ fontSize: 12, color: "#64748B" }}>
            {gapAnalysis.priorMonth}: {gapAnalysis.priorItems} items · {gapAnalysis.priorPoints} pts lost &nbsp;→&nbsp;
            {gapAnalysis.currentMonth}: {gapAnalysis.currentItems} items · {gapAnalysis.currentPoints} pts lost
            &nbsp;({gapAnalysis.pointsDelta >= 0 ? "+" : ""}{gapAnalysis.pointsDelta} pts)
          </div>
        </div>
      )}
      {gapAnalysis?.isPartialMonth && (
        <div style={{
          fontSize: 11,
          color: "#F59E0B",
          background: "#F59E0B11",
          border: "1px solid #F59E0B33",
          borderRadius: 6,
          padding: "6px 12px",
          marginTop: -12,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span>⚠</span>
          <span>
            {gapAnalysis.currentMonth} is in progress ({gapAnalysis.daysIntoMonth} days in) — comparison will change as the month completes.
          </span>
        </div>
      )}

      {/* Monthly Summary Table */}
      {loading ? (
        <div style={{ color: "#64748B", fontSize: 13, marginBottom: 20 }}>Loading attrition history\u2026</div>
      ) : monthlySummary.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Attrition History</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Items Lost</th>
                  <th>Points Lost</th>
                  <th>Premium Lost</th>
                  <th>MoM Items</th>
                  <th>MoM Points</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((row, i) => {
                  const next = monthlySummary[i + 1]; // prior month (older)
                  const itemsDelta = next ? row.items - next.items : null;
                  const pointsDelta = next ? row.points - next.points : null;
                  return (
                    <tr key={row.report_month}>
                      <td style={{ color: "#E2E8F0", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{row.report_month.slice(0, 7)}</td>
                      <td style={{ color: "#F1F5F9", fontWeight: 600 }}>{row.items}</td>
                      <td style={{ color: "#F59E0B", fontWeight: 600 }}>{row.points}</td>
                      <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>${Math.round(row.premium).toLocaleString()}</td>
                      <td style={{ color: itemsDelta == null ? "#334155" : itemsDelta > 0 ? "#EF4444" : "#10B981", fontSize: 12 }}>
                        {itemsDelta == null ? "—" : `${itemsDelta >= 0 ? "+" : ""}${itemsDelta}`}
                      </td>
                      <td style={{ color: pointsDelta == null ? "#334155" : pointsDelta > 0 ? "#EF4444" : "#10B981", fontSize: 12 }}>
                        {pointsDelta == null ? "—" : `${pointsDelta >= 0 ? "+" : ""}${pointsDelta}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>No attrition history yet. Upload your first report below.</div>
      )}

      {/* Upload Section */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Upload Termination Report</div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: "#64748B", display: "block", marginBottom: 4 }}>Report Month</label>
          <input
            type="month"
            value={reportMonth.slice(0, 7)}
            onChange={e => setReportMonth(`${e.target.value}-01`)}
            style={{ fontFamily: "inherit" }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <input ref={lapseFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileSelect} />
          <button className="btn-ghost" onClick={() => lapseFileRef.current?.click()}>
            {lapseFile ? `\uD83D\uDCC4 ${lapseFile.name}` : "Choose File"}
          </button>
        </div>
      </div>

      {parseError && (
        <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>
          {parseError}
        </div>
      )}

      {/* Preview */}
      {preview && !commitMsg && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 12 }}>Preview — {reportMonth.slice(0, 7)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Items Lost", value: preview.items, color: "#EF4444" },
              { label: "Points Lost", value: preview.points, color: "#F59E0B" },
              { label: "Premium Lost", value: `$${Math.round(preview.premium).toLocaleString()}`, color: "#94A3B8" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Product breakdown */}
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>
            {Object.entries(preview.byProduct).map(([prod, count]) => (
              <span key={prod} style={{ marginRight: 12 }}>{prod}: <strong style={{ color: "#94A3B8" }}>{count}</strong></span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={handleCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={() => { setParsedRows(null); setLapseFile(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {commitMsg && (
        <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#10B981" }}>
          {commitMsg}
        </div>
      )}
    </div>
  );
}

// ─── Global Styles ─────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1A1D27; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; } input, select { background: #1E2130 !important; color: #E2E8F0 !important; border: 1px solid #2D3348 !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: #3B82F6 !important; } .card { background: #161924; border: 1px solid #252A3A; border-radius: 12px; padding: 20px; } .btn-primary { background: #3B82F6; color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: #94A3B8; border: 1px solid #2D3348; border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: #1E2130; color: #E2E8F0; border-color: #3B82F6; } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: #64748B; transition: all 0.15s; } .tab.active { background: #1E2130; color: #E2E8F0; } .upload-zone { border: 2px dashed #2D3348; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: #3B82F6; } label { font-size: 12px; color: #64748B; font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252A3A; } td { padding: 9px 12px; border-bottom: 1px solid #1A1D27; color: #CBD5E1; } .urgency-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; font-family: 'DM Mono', monospace; } .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; } .triage-row:hover td { background: #1A1D27; cursor: pointer; } .scroll-hint-container { position: relative; } .scroll-hint-container::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px; background: linear-gradient(to right, transparent, #0f172a); pointer-events: none; opacity: 1; transition: opacity 0.2s; } @media (min-width: 840px) { .scroll-hint-container::after { opacity: 0; } }`;

// ─── Net Portfolio Growth Tab ──────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function NetGrowthTab({ agencyId }) {
  const { data: months = [], isLoading: loading } = useQuery({
    queryKey: ["net_growth", agencyId],
    queryFn: async () => {
      const [{ data: nbRows }, { data: lapseRows }] = await Promise.all([
        supabase
          .from("revenue_entries")
          .select("issued_date, product, item_count, premium")
          .eq("agency_id", agencyId)
          .order("issued_date", { ascending: true }),
        supabase
          .from("lapse_events")
          .select("report_month, product, item_count, premium")
          .eq("agency_id", agencyId),
      ]);

      const monthMap = {};
      const ensure = (m) => {
        if (!monthMap[m]) monthMap[m] = {
          month: m,
          nb_points: 0, nb_items: 0, nb_premium: 0,
          lapse_points: 0, lapse_items: 0, lapse_premium: 0,
        };
      };

      (nbRows ?? []).forEach(r => {
        const m = r.issued_date?.slice(0, 7);
        if (!m) return;
        ensure(m);
        const pts = (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
        monthMap[m].nb_points   += pts;
        monthMap[m].nb_items    += r.item_count ?? 1;
        monthMap[m].nb_premium  += r.premium ?? 0;
      });

      (lapseRows ?? []).forEach(r => {
        const m = r.report_month?.slice(0, 7);
        if (!m) return;
        ensure(m);
        const pts = (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
        monthMap[m].lapse_points   += pts;
        monthMap[m].lapse_items    += r.item_count ?? 1;
        monthMap[m].lapse_premium  += r.premium ?? 0;
      });

      return Object.values(monthMap)
        .map(m => ({ ...m, net_points: m.nb_points - m.lapse_points }))
        .sort((a, b) => a.month.localeCompare(b.month));
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  if (loading) {
    return <div style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Loading…</div>;
  }

  if (months.length === 0) {
    return (
      <div style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
        No data yet — upload New Business and Termination reports to see portfolio growth.
      </div>
    );
  }

  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cur = months.find(m => m.month === curMonth);

  const fmtMonth = (m) => {
    const [y, mo] = m.split("-");
    return `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`;
  };

  const totals = months.reduce((acc, m) => ({
    nb_points: acc.nb_points + m.nb_points,
    lapse_points: acc.lapse_points + m.lapse_points,
    net_points: acc.net_points + m.net_points,
    nb_items: acc.nb_items + m.nb_items,
    lapse_items: acc.lapse_items + m.lapse_items,
    nb_premium: acc.nb_premium + m.nb_premium,
    lapse_premium: acc.lapse_premium + m.lapse_premium,
  }), { nb_points: 0, lapse_points: 0, net_points: 0, nb_items: 0, lapse_items: 0, nb_premium: 0, lapse_premium: 0 });

  // Running cumulative — only accumulate months within the current year
  const currentYear = new Date().getFullYear().toString();
  let runningNet = 0;
  const monthsWithYTD = months.map(m => {
    const net_items = m.nb_items - m.lapse_items;
    if (m.month.startsWith(currentYear)) {
      runningNet += m.net_points;
      return { ...m, net_ytd: runningNet, net_items };
    }
    return { ...m, net_ytd: null, net_items };
  });

  const totalNetItems = monthsWithYTD.reduce((s, m) => s + m.net_items, 0);

  const finalNetYTD = [...monthsWithYTD]
    .filter(m => m.net_ytd !== null)
    .at(-1)?.net_ytd ?? null;

  const newestFirst = [...monthsWithYTD].reverse();

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Summary Strip */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1, background: "#1A1D27", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Points Gained</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#10B981" }}>
            {cur && cur.nb_points > 0 ? cur.nb_points.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ flex: 1, background: "#1A1D27", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Points Lost</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#EF4444" }}>
            {cur && cur.lapse_points > 0 ? cur.lapse_points.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ flex: 1, background: "#1A1D27", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Net Points</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: cur ? (cur.net_points > 0 ? "#10B981" : cur.net_points < 0 ? "#EF4444" : "#64748B") : "#64748B" }}>
            {cur ? cur.net_points.toLocaleString() : "—"}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tickFormatter={m => {
              const [y, mo] = m.split("-");
              return `${MONTH_SHORT[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
            }}
            tick={{ fill: "#64748B", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            labelFormatter={fmtMonth}
            contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [value, name === "nb_points" ? "Points Gained" : name === "lapse_points" ? "Points Lost" : "Net"]}
          />
          <ReferenceLine y={0} stroke="#334155" />
          <Bar dataKey="nb_points" name="nb_points" fill="#10B981" radius={[3,3,0,0]} maxBarSize={28} />
          <Bar dataKey="lapse_points" name="lapse_points" fill="#EF4444" radius={[3,3,0,0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>

      {/* Net Points Line Chart */}
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" hide />
            <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
            <Tooltip
              labelFormatter={fmtMonth}
              contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }}
              formatter={(value) => [value, "Net Points"]}
            />
            <Line
              type="monotone"
              dataKey="net_points"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={({ cx, cy, payload }) => (
                <circle key={payload.month} cx={cx} cy={cy} r={4}
                  fill={payload.net_points >= 0 ? "#10B981" : "#EF4444"}
                  stroke="none"
                />
              )}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Table */}
      <div style={{ marginTop: 24, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th style={{ textAlign: "right" }}>Points Gained</th>
              <th style={{ textAlign: "right" }}>Points Lost</th>
              <th style={{ textAlign: "right" }}>Net Points</th>
              <th style={{ textAlign: "right" }}>Net Items</th>
              <th style={{ textAlign: "right" }}>Net YTD</th>
              <th style={{ textAlign: "right" }}>Items In</th>
              <th style={{ textAlign: "right" }}>Items Out</th>
              <th style={{ textAlign: "right" }}>Premium In</th>
              <th style={{ textAlign: "right" }}>Premium Lost</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map(m => (
              <tr key={m.month} style={m.month === curMonth ? { borderLeft: "2px solid #3B82F6" } : undefined}>
                <td style={{ fontWeight: 500, color: "#E2E8F0" }}>{fmtMonth(m.month)}</td>
                <td style={{ textAlign: "right", color: "#10B981" }}>{m.nb_points.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "#EF4444" }}>{m.lapse_points.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: m.net_points > 0 ? "#10B981" : m.net_points < 0 ? "#EF4444" : "#64748B" }}>
                  {m.net_points.toLocaleString()}
                </td>
                <td style={{
                  textAlign: "right",
                  fontFamily: "'DM Mono', monospace",
                  color: m.net_items > 0 ? "#10B981" : m.net_items < 0 ? "#EF4444" : "#64748B",
                  fontWeight: 600,
                }}>
                  {m.net_items > 0 ? `+${m.net_items}` : String(m.net_items)}
                </td>
                <td style={{
                  textAlign: "right",
                  fontFamily: "'DM Mono', monospace",
                  color: m.net_ytd === null
                    ? "#334155"
                    : m.net_ytd > 0 ? "#10B981"
                    : m.net_ytd < 0 ? "#EF4444"
                    : "#64748B",
                  fontWeight: 600,
                }}>
                  {m.net_ytd === null
                    ? "—"
                    : m.net_ytd > 0 ? `+${m.net_ytd}` : String(m.net_ytd)
                  }
                </td>
                <td style={{ textAlign: "right" }}>{m.nb_items.toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>{m.lapse_items.toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>${m.nb_premium.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                <td style={{ textAlign: "right" }}>${m.lapse_premium.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #252A3A", fontWeight: 600 }}>
              <td style={{ color: "#E2E8F0" }}>Total</td>
              <td style={{ textAlign: "right", color: "#10B981" }}>{totals.nb_points.toLocaleString()}</td>
              <td style={{ textAlign: "right", color: "#EF4444" }}>{totals.lapse_points.toLocaleString()}</td>
              <td style={{ textAlign: "right", color: totals.net_points > 0 ? "#10B981" : totals.net_points < 0 ? "#EF4444" : "#64748B" }}>
                {totals.net_points.toLocaleString()}
              </td>
              <td style={{
                textAlign: "right",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                color: totalNetItems > 0 ? "#10B981" : totalNetItems < 0 ? "#EF4444" : "#64748B",
              }}>
                {totalNetItems > 0 ? `+${totalNetItems}` : String(totalNetItems)}
              </td>
              <td style={{
                textAlign: "right",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                color: finalNetYTD === null ? "#334155" : finalNetYTD >= 0 ? "#10B981" : "#EF4444",
              }}>
                {finalNetYTD === null ? "—" : finalNetYTD > 0 ? `+${finalNetYTD}` : String(finalNetYTD)}
              </td>
              <td style={{ textAlign: "right" }}>{totals.nb_items.toLocaleString()}</td>
              <td style={{ textAlign: "right" }}>{totals.lapse_items.toLocaleString()}</td>
              <td style={{ textAlign: "right" }}>${totals.nb_premium.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
              <td style={{ textAlign: "right" }}>${totals.lapse_premium.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Unified Detail Modal ───────────────────────────────────────────────────

function UnifiedDetailModal({ row, onClose, agencyId, employeeMap, producers = [], onReassign }) {
  const [saving, setSaving] = useState(false);
  const [localRow, setLocalRow] = useState(row);

  // Use localRow for display so reassignment reflects immediately without closing modal
  const r = localRow;

  async function reassign(side, employeeId) {
    // side: 'cancel' | 'renewal'
    setSaving(true);
    try {
      if (side === 'cancel' && r.cancel_event_id) {
        // Sync both assigned_to_id (FK) and assigned_to (legacy text) for display
        const rep = producers.find(p => p.id === employeeId);
        const displayName = rep
          ? (rep.preferred_name || `${rep.first_name || ''} ${rep.last_name || ''}`.trim())
          : null;
        const { error } = await supabase
          .from('pending_cancel_events')
          .update({ assigned_to_id: employeeId || null, assigned_to: displayName })
          .eq('id', r.cancel_event_id);
        if (error) throw error;
        setLocalRow(prev => ({ ...prev, cancel_assigned_to_id: employeeId || null }));
      }
      if (side === 'renewal' && r.renewal_event_id) {
        const { error } = await supabase
          .from('renewal_events')
          .update({ assigned_to_id: employeeId || null })
          .eq('id', r.renewal_event_id);
        if (error) throw error;
        setLocalRow(prev => ({ ...prev, renewal_assigned_to_id: employeeId || null }));
      }
      if (onReassign) onReassign(localRow);
    } catch (err) {
      console.error('[reassign error]', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#161924', borderRadius: 14, maxWidth: '98vw', width: '100%', maxHeight: '96vh', overflow: 'auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9' }}>
            {maskCustomerName(r.customer_name)}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Policy {r.policy_no} · {r.product?.toUpperCase()}
            {r.risk_type === 'dual_risk' && (
              <span style={{ marginLeft: 8, color: '#EF4444', fontWeight: 700 }}>⚡ DUAL RISK</span>
            )}
          </div>
        </div>

        {/* Contact info */}
        {(r.phone || r.email) && (
          <div style={{ background: '#1A1D27', borderRadius: 8, padding: '12px 14px', marginBottom: 16, border: '1px solid #252A3A' }}>
            <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {r.phone && (
                <div>
                  <div style={{ fontSize: 10, color: '#475569' }}>Phone</div>
                  <div style={{ fontSize: 13, color: '#E2E8F0', fontFamily: "'DM Mono', monospace" }}>{r.phone}</div>
                </div>
              )}
              {r.email && (
                <div>
                  <div style={{ fontSize: 10, color: '#475569' }}>Email</div>
                  <div style={{ fontSize: 13, color: '#94A3B8' }}>{r.email}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pending cancel section */}
        {r.cancel_event_id && (
          <div style={{ background: '#1A1D27', borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: '1px solid #F59E0B44' }}>
            <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
              ⚠ Pending Cancellation
            </div>

            {/* Row 1 — Urgency + Status */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Cancel Date', value: r.cancel_effective_date,
                  color: urgencyColor(daysUntilCancel(r.cancel_effective_date)) },
                { label: 'Days Left',
                  value: (() => { const d = daysUntilCancel(r.cancel_effective_date); return d <= 0 ? 'PAST DUE' : `${d} days`; })(),
                  color: urgencyColor(daysUntilCancel(r.cancel_effective_date)) },
                { label: 'Status',
                  value: STATUS_CONFIG[r.cancel_status]?.label || r.cancel_status || '—' },
                { label: 'Promise Date', value: r.promise_date || '—',
                  color: (() => {
                    if (!r.promise_date) return '#64748B';
                    const d = Math.ceil((new Date(r.promise_date) - new Date()) / 86400000);
                    return d <= 1 ? '#EF4444' : d <= 3 ? '#F59E0B' : '#94A3B8';
                  })() },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || '#E2E8F0', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Row 2 — Financial + Context */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Premium at Risk', value: r.premium_at_risk ? fmtFull$(r.premium_at_risk) : '—' },
                { label: 'Cycle', value: `#${r.cycle || 1}`,
                  color: (r.cycle || 1) >= 3 ? '#EF4444' : (r.cycle || 1) === 2 ? '#F59E0B' : '#94A3B8' },
                { label: 'Attempts', value: r.cancel_attempts || 0,
                  color: (r.cancel_attempts || 0) >= 3 ? '#EF4444' : '#94A3B8' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || '#E2E8F0', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}

              {/* Assigned — inline dropdown */}
              <div style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>Assigned To</div>
                <select
                  value={r.cancel_assigned_to_id || ''}
                  onChange={e => reassign('cancel', e.target.value || null)}
                  disabled={saving}
                  style={{
                    background: 'transparent', color: '#E2E8F0', border: 'none',
                    fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer', width: '100%', padding: 0, outline: 'none',
                  }}
                >
                  <option value="">— Unassigned</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        )}

        {/* Renewal section */}
        {r.renewal_event_id && (
          <div style={{ background: '#1A1D27', borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: '1px solid #3B82F644' }}>
            <div style={{ fontSize: 11, color: '#3B82F6', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
              🔄 Renewal
            </div>

            {/* Row 1 — Urgency + Status (4 fields) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
              {[
                { label: 'Renewal Date', value: r.renewal_date,
                  color: renewalUrgencyColor(daysUntilRenewal(r.renewal_date)) },
                { label: 'Days Until',
                  value: (() => { const d = daysUntilRenewal(r.renewal_date); return d <= 0 ? 'PAST DUE' : `${d} days`; })(),
                  color: renewalUrgencyColor(daysUntilRenewal(r.renewal_date)) },
                { label: 'Status',
                  value: RENEWAL_STATUS_CONFIG[r.renewal_status]?.label || r.renewal_status || '—' },
                { label: 'Attempts', value: r.renewal_attempts || 0 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || '#E2E8F0', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Row 2 — Financial + Context (8 fields) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Premium',
                  value: r.renewal_premium ? fmtFull$(r.renewal_premium) : '—' },
                { label: 'Premium Δ',
                  value: r.premium_change != null
                    ? `${r.premium_change > 0 ? '+' : ''}${fmtFull$(r.premium_change)}`
                    : '—',
                  color: r.premium_change == null ? '#94A3B8'
                       : r.premium_change > 0 ? '#EF4444' : '#10B981' },
                { label: 'Δ%',
                  value: r.premium_change_pct != null
                    ? `${r.premium_change_pct > 0 ? '+' : ''}${r.premium_change_pct.toFixed(1)}%`
                    : '—',
                  color: r.premium_change_pct == null ? '#94A3B8'
                       : r.premium_change_pct > 0 ? '#EF4444' : '#10B981' },
                { label: 'Tenure',
                  value: r.original_year
                    ? `${new Date().getFullYear() - r.original_year} yrs (${r.original_year})`
                    : '—' },
                { label: 'Easy Pay',
                  value: r.easy_pay === true ? 'Yes ✓' : r.easy_pay === false ? 'No' : '—' },
                { label: 'Multi-Line',
                  value: r.multi_line === 'Yes' ? 'Yes — Bundled'
                       : r.multi_line === 'No'  ? 'No — Monoline'
                       : '—',
                  color: r.multi_line === 'Yes' ? '#10B981'
                       : r.multi_line === 'No'  ? '#60A5FA'
                       : '#64748B' },
                { label: 'Items',
                  value: r.renewal_item_count || 1 },
                { label: 'Points',
                  value: `${((LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.renewal_item_count || 1)).toLocaleString()} pts`,
                  color: '#8B5CF6' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: color || '#E2E8F0', fontFamily: "'DM Mono', monospace" }}>{value ?? '—'}</div>
                </div>
              ))}

              {/* Assigned — inline dropdown */}
              <div style={{ background: '#161924', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>Assigned To</div>
                <select
                  value={r.renewal_assigned_to_id || ''}
                  onChange={e => reassign('renewal', e.target.value || null)}
                  disabled={saving}
                  style={{
                    background: 'transparent', color: '#E2E8F0', border: 'none',
                    fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer', width: '100%', padding: 0, outline: 'none',
                  }}
                >
                  <option value="">— Unassigned</option>
                  {producers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

          </div>
        )}

        <button className="btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}

// ─── Unified At Risk Tab ────────────────────────────────────────────────────

// Compute portfolio points at risk for a single row in policy_retention_status.
// For dual risk: use renewal_item_count (more accurate — has actual vehicle count).
// For pending cancel only: use cancel_item_count (always 1).
// For renewal only: use renewal_item_count.
function calcRowPoints(row) {
  const product = row.product || 'other';
  const pts = LAPSE_PORTFOLIO_POINTS[product] ?? 0;
  const items = row.risk_type === 'pending_cancel'
    ? (row.cancel_item_count || 1)
    : (row.renewal_item_count || 1);
  return pts * items;
}

function calcUnifiedPriority(row) {
  const cancelScore = row.cancel_event_id
    ? calcCancelPriority({
        cancel_effective_date: row.cancel_effective_date,
        premium_at_risk:       row.premium_at_risk,
        attempt_count:         row.cancel_attempts,
        cycle:                 row.cycle,
        status:                row.cancel_status,
        promise_date:          row.promise_date,
      })
    : 0;

  const renewalScore = row.renewal_event_id
    ? calcRenewalPriority({
        renewal_date:       row.renewal_date,
        premium_change_pct: row.premium_change_pct,
        original_year:      row.original_year,
        premium:            row.renewal_premium,
        easy_pay:           row.easy_pay,
      })
    : 0;

  const base = Math.max(cancelScore, renewalScore);
  // Dual risk adds 15 — one call needs to handle both cancel AND renewal
  return row.risk_type === 'dual_risk' ? Math.min(base + 15, 100) : base;
}

function UnifiedAtRiskTab({ agencyId, currentUserId, currentEmployeeId }) {
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['policy_retention_status', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policy_retention_status')
        .select('*')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: producers = [] } = useQuery({
    queryKey: ['producers', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .contains('roles', ['service'])
        .order('last_name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const employeeMap = useMemo(() => {
    const m = {};
    producers.forEach(p => { m[p.id] = p.preferred_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(); });
    return m;
  }, [producers]);

  const [riskFilter, setRiskFilter] = useState('all');
  const [myCasesOnly, setMyCasesOnly] = useState(false);
  const [sortCol, setSortCol] = useState('priority');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedUnified, setSelectedUnified] = useState(null);
  // Drilldown: { event, side: 'cancel'|'renewal' } — opens the full detail modal with logging
  const [drilldown, setDrilldown] = useState(null);

  async function openDrilldown(row, side) {
    // For single-risk rows, auto-pick the side
    if (!side) {
      if (row.risk_type === 'pending_cancel') side = 'cancel';
      else if (row.risk_type === 'renewal') side = 'renewal';
      else {
        // dual_risk — pick the more urgent side
        const cd = row.cancel_effective_date ? daysUntilCancel(row.cancel_effective_date) : 999;
        const rd = row.renewal_date ? daysUntilRenewal(row.renewal_date) : 999;
        side = cd <= rd ? 'cancel' : 'renewal';
      }
    }
    // Fetch full event record so the detail modal has all fields
    const table = side === 'cancel' ? 'pending_cancel_events' : 'renewal_events';
    const eventId = side === 'cancel' ? row.cancel_event_id : row.renewal_event_id;
    if (!eventId) return;
    const { data } = await supabase.from(table).select('*').eq('id', eventId).single();
    if (data) {
      // Carry over computed priority from unified row
      data._priority = row._priority;
      setDrilldown({ event: data, side, unifiedRow: row });
    }
  }

  async function updateCancelEvent(id, updates) {
    const { error } = await supabase
      .from('pending_cancel_events')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    }
    return error;
  }

  async function updateRenewalEvent(id, updates) {
    const { error } = await supabase
      .from('renewal_events')
      .update(updates)
      .eq('id', id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    }
    return error;
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  const filteredRows = useMemo(() => {
    let list = rows.map(r => ({ ...r, _priority: calcUnifiedPriority(r) }));

    if (riskFilter !== 'all') {
      list = list.filter(r => r.risk_type === riskFilter);
    }

    if (myCasesOnly && currentEmployeeId) {
      list = list.filter(r =>
        r.cancel_assigned_to_id === currentEmployeeId ||
        r.renewal_assigned_to_id === currentEmployeeId
      );
    }

    // Sort logic
    if (sortCol === 'priority') {
      return list.sort((a, b) =>
        sortDir === 'asc' ? a._priority - b._priority : b._priority - a._priority
      );
    }

    return list.sort((a, b) => {
      let aVal, bVal;
      switch (sortCol) {
        case 'customer_name':
          aVal = (a.customer_name || '').toLowerCase();
          bVal = (b.customer_name || '').toLowerCase();
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'product':
          aVal = (a.product || '').toLowerCase();
          bVal = (b.product || '').toLowerCase();
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'cancel_date':
          aVal = a.cancel_effective_date || '9999';
          bVal = b.cancel_effective_date || '9999';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'renewal_date_actual':
          aVal = a.renewal_date || '';
          bVal = b.renewal_date || '';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'renewal_date':
          aVal = a.renewal_date || '9999';
          bVal = b.renewal_date || '9999';
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case 'premium':
          aVal = a.risk_type === 'renewal' ? (a.renewal_premium || 0) : (a.premium_at_risk || 0);
          bVal = b.risk_type === 'renewal' ? (b.renewal_premium || 0) : (b.premium_at_risk || 0);
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        case 'premium_change_pct':
          aVal = a.premium_change_pct || 0;
          bVal = b.premium_change_pct || 0;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        default:
          return sortDir === 'asc' ? a._priority - b._priority : b._priority - a._priority;
      }
    });
  }, [rows, riskFilter, myCasesOnly, currentEmployeeId, sortCol, sortDir]);

  if (isLoading) {
    return <div style={{ color: '#64748B', fontSize: 13 }}>Loading at-risk policies...</div>;
  }

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard
          label="Dual Risk"
          value={rows.filter(r => r.risk_type === 'dual_risk').length}
          sub="cancel + renewal"
          color="#EF4444"
        />
        <KpiCard
          label="Pending Cancel"
          value={rows.filter(r => r.risk_type === 'pending_cancel').length}
          sub="payment risk"
          color="#F59E0B"
        />
        <KpiCard
          label="Renewals"
          value={rows.filter(r => r.risk_type === 'renewal').length}
          sub="shopping risk"
          color="#3B82F6"
        />
        <KpiCard
          label="Multi-Line at Risk"
          value={rows.filter(r => r.multi_line === 'Yes').length}
          sub="bundled customers"
          color="#10B981"
        />
        <KpiCard
          label="Items at Risk"
          value={rows.reduce((s, r) => s + (
            r.risk_type === 'pending_cancel'
              ? (r.cancel_item_count || 1)
              : (r.renewal_item_count || 1)
          ), 0).toLocaleString()}
          sub="total policy items"
          color="#06B6D4"
        />
        <KpiCard
          label="Points at Risk"
          value={rows.reduce((s, r) => s + calcRowPoints(r), 0).toLocaleString()}
          sub="portfolio impact"
          color="#8B5CF6"
        />
        <KpiCard
          label="Premium Exposed"
          value={fmt$(rows.reduce((s, r) => s + (r.premium_at_risk || 0) + (r.renewal_premium || 0), 0))}
          sub="total at risk"
          color="#EC4899"
        />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all',            label: `All (${rows.length})` },
          { key: 'dual_risk',      label: `🔴 Dual Risk (${rows.filter(r => r.risk_type === 'dual_risk').length})` },
          { key: 'pending_cancel', label: 'Pending Cancel' },
          { key: 'renewal',        label: 'Renewals' },
        ].map(f => (
          <button key={f.key} className={`btn-ghost ${riskFilter === f.key ? 'active' : ''}`}
            onClick={() => setRiskFilter(f.key)}>
            {f.label}
          </button>
        ))}

        {/* My Cases toggle */}
        <button
          onClick={() => setMyCasesOnly(v => !v)}
          className={`btn-ghost ${myCasesOnly ? 'active' : ''}`}
          style={{ marginLeft: 'auto' }}
        >
          👤 My Cases
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <SortTh col="priority"           label="Priority"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th>Stage</th>
              <SortTh col="customer_name"      label="Customer"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              {/* Cancel column — hide when filtering to renewal-only */}
              {riskFilter !== 'renewal' && (
                <SortTh col="cancel_date" label="Cancel" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}

              {/* Date column — show actual renewal date, only when filtering to renewal */}
              {riskFilter === 'renewal' && (
                <SortTh col="renewal_date_actual" label="Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}

              {/* Renewal days-remaining column — hide when filtering to cancel-only */}
              {riskFilter !== 'pending_cancel' && (
                <SortTh col="renewal_date" label="Renewal" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              )}
              <SortTh col="premium"             label="Premium"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="premium_change_pct" label="Δ%"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh col="product"            label="Product"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th>Attempts</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const cancelDays = row.cancel_effective_date ? daysUntilCancel(row.cancel_effective_date) : null;
              const renewalDays = row.renewal_date ? daysUntilRenewal(row.renewal_date) : null;

              return (
                <tr key={`${row.cancel_event_id || ''}-${row.renewal_event_id || ''}`}
                  className="triage-row"
                  onClick={() => openDrilldown(row)}>

                  {/* Priority */}
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                      fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                      background: row._priority >= 80 ? '#EF444422' : row._priority >= 55 ? '#F59E0B22' : row._priority >= 30 ? '#3B82F622' : '#64748B22',
                      color:      row._priority >= 80 ? '#EF4444'   : row._priority >= 55 ? '#F59E0B'   : row._priority >= 30 ? '#3B82F6'   : '#64748B',
                    }}>{row._priority}</span>
                  </td>

                  {/* Stage */}
                  <td>
                    {row.cancel_stage === 'cancelled' ? (
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 10, fontWeight: 700, background: '#EF444422', color: '#EF4444' }}>
                        🚫 Lapsed
                      </span>
                    ) : row.cancel_event_id ? (
                      <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                        fontSize: 10, fontWeight: 700, background: '#F59E0B22', color: '#F59E0B' }}>
                        ⚠ Pending
                      </span>
                    ) : null}
                  </td>

                  {/* Customer name */}
                  <td style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 13 }}>
                    {maskCustomerName(row.customer_name)}
                    {row.risk_type === 'dual_risk' && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#EF4444' }}>⚡</span>
                    )}
                  </td>

                  {/* Cancel urgency cell */}
                  {riskFilter !== 'renewal' && (
                    <td>
                      {row.cancel_effective_date ? (
                        <span style={{ color: urgencyColor(cancelDays), fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                          {cancelDays <= 0 ? 'PAST DUE' : `${cancelDays}d`}
                        </span>
                      ) : <span style={{ color: '#334155' }}>—</span>}
                    </td>
                  )}

                  {/* Renewal actual date cell — only in renewal filter */}
                  {riskFilter === 'renewal' && (
                    <td style={{ color: '#94A3B8', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      {row.renewal_date || '—'}
                    </td>
                  )}

                  {/* Renewal days-remaining cell */}
                  {riskFilter !== 'pending_cancel' && (
                    <td>
                      {row.renewal_date ? (
                        <span style={{ color: renewalUrgencyColor(renewalDays), fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                          {renewalDays <= 0 ? 'PAST' : `${renewalDays}d`}
                        </span>
                      ) : <span style={{ color: '#334155' }}>—</span>}
                    </td>
                  )}

                  <td style={{ color: '#E2E8F0', fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                    {row.risk_type === 'renewal'
                      ? (row.renewal_premium ? fmtFull$(row.renewal_premium) : '—')
                      : (row.premium_at_risk ? fmtFull$(row.premium_at_risk) : '—')}
                  </td>

                  <td style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 12,
                    color: row.premium_change_pct == null ? '#64748B' : row.premium_change_pct > 0 ? '#EF4444' : '#10B981'
                  }}>
                    {row.premium_change_pct != null ? `${row.premium_change_pct > 0 ? '+' : ''}${row.premium_change_pct.toFixed(1)}%` : '—'}
                  </td>

                  {/* Product */}
                  <td style={{ color: '#94A3B8', fontSize: 12 }}>
                    {row.product?.toUpperCase() || '—'}
                  </td>

                  <td style={{ color: '#64748B', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                    {((row.cancel_attempts || 0) + (row.renewal_attempts || 0)) || 0}
                  </td>

                  <td style={{ color: '#64748B', fontSize: 12 }}>
                    {(() => {
                      const cId = row.cancel_assigned_to_id;
                      const rId = row.renewal_assigned_to_id;
                      if (!cId && !rId) return '—';
                      const cName = cId ? employeeMap[cId] : null;
                      const rName = rId ? employeeMap[rId] : null;
                      if (cId && rId && cId !== rId) return `${cName || '✓'} / ${rName || '✓'}`;
                      return cName || rName || '✓';
                    })()}
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#334155', padding: '32px 0' }}>
                No at-risk policies in this filter
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drilldown detail modal — opens the full cancel or renewal modal with logging */}
      {drilldown && drilldown.side === 'cancel' && (
        <EventDetailModal
          event={drilldown.event}
          onClose={() => setDrilldown(null)}
          onUpdate={updateCancelEvent}
          agencyId={agencyId}
          currentEmployeeId={currentEmployeeId}
          producers={producers}
        />
      )}
      {drilldown && drilldown.side === 'renewal' && (
        <RenewalDetailModal
          event={drilldown.event}
          onClose={() => setDrilldown(null)}
          onUpdate={updateRenewalEvent}
          producers={producers}
          agencyId={agencyId}
          currentEmployeeId={currentEmployeeId}
        />
      )}
      {/* For dual_risk rows, show a switch button inside the modal overlay */}
      {drilldown && drilldown.unifiedRow?.risk_type === 'dual_risk' && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1010, display: 'flex', gap: 8,
        }}>
          <button
            className={drilldown.side === 'cancel' ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
            onClick={() => openDrilldown(drilldown.unifiedRow, 'cancel')}
          >
            Cancel Details
          </button>
          <button
            className={drilldown.side === 'renewal' ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8 }}
            onClick={() => openDrilldown(drilldown.unifiedRow, 'renewal')}
          >
            Renewal Details
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Renewal Upload Zone (extracted from RenewalTab) ──────────────────────────

function RenewalUploadZone({ agencyId, currentUserId, currentEmployeeId }) {
  const queryClient = useQueryClient();
  const [uploadFile, setUploadFile]       = useState(null);
  const [parsedRows, setParsedRows]       = useState(null);
  const [excludedCount, setExcludedCount] = useState(0);
  const [uploadError, setUploadError]     = useState('');
  const [uploadMsg, setUploadMsg]         = useState('');
  const [isParsing, setIsParsing]         = useState(false);
  const [isCommitting, setIsCommitting]   = useState(false);
  const fileInputRef = useRef(null);

  const { data: producers = [] } = useQuery({
    queryKey: ['producers', agencyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .contains('roles', ['service'])
        .order('last_name');
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  async function handleFileSelect(file) {
    if (!file) return;
    setUploadFile(file);
    setUploadError("");
    setUploadMsg("");
    setParsedRows(null);
    setExcludedCount(0);
    setIsParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseRenewalXLSX(new Uint8Array(buf));
      if (rows.length === 0) {
        setUploadError("No valid rows found. Check that the file has Policy No and Renewal Date columns.");
        return;
      }
      // Filter out already-resolved rows at parse time so the preview count
      // only shows actionable rows. The auto-resolve logic in handleCommit
      // handles Renewal Taken rows by fetching existing DB rows and comparing
      // — it does NOT need Renewal Taken rows in parsedRows to work correctly.
      const hasStatusCol = rows.some(r => r.renewal_status);
      if (hasStatusCol) {
        const actionable = rows.filter(
          r => !r.renewal_status || r.renewal_status === 'Renewal Not Taken'
        );
        const excluded = rows.length - actionable.length;
        setExcludedCount(excluded);
        if (actionable.length === 0) {
          setUploadError(`All ${rows.length} rows are already renewed or not applicable. No actionable rows to import.`);
          return;
        }
        setParsedRows(actionable);
      } else {
        setExcludedCount(0);
        setParsedRows(rows);
      }
    } catch (err) {
      console.error("[renewal parse error]", err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCommit() {
    if (!parsedRows || !agencyId || isCommitting) return;
    setIsCommitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Find existing rows (for upsert dedup) — also fetch status for auto-resolve logic
      const policyNos = [...new Set(parsedRows.map(r => r.policy_no))];
      const { data: existing, error: lookupErr } = await supabase
        .from('renewal_events')
        .select('policy_no, renewal_date, status')
        .eq('agency_id', agencyId)
        .in('policy_no', policyNos)
        .limit(10000);
      if (lookupErr) throw new Error(lookupErr.message);
      const existingKeys = new Set((existing ?? []).map(e => `${e.policy_no}|${e.renewal_date}`));

      // Build map of current status per row
      const existingStatus = {};
      (existing ?? []).forEach(e => {
        existingStatus[`${e.policy_no}|${e.renewal_date}`] = e.status;
      });

      // For new rows, exclude "Renewal Taken" / "Not Applicable" — no point adding already-resolved cases
      const REPORT_RESOLVED_STATUSES = new Set(['Renewal Taken', 'Not Applicable']);
      const toAdd = parsedRows.filter(r =>
        !existingKeys.has(`${r.policy_no}|${r.renewal_date}`) &&
        !REPORT_RESOLVED_STATUSES.has(r.renewal_status)
      );
      const updatedCount = parsedRows.filter(r => existingKeys.has(`${r.policy_no}|${r.renewal_date}`)).length;

      // 2. Load all active service reps
      const { data: reps } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId)
        .eq('employment_status', 'active')
        .contains('roles', ['service'])
        .order('last_name');

      const activeReps = reps || [];
      const assignmentQueue = [...activeReps];

      // 3. Build assignment rotation — seed with existing caseloads for balanced distribution
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from('renewal_events')
          .select('assigned_to_id')
          .eq('agency_id', agencyId)
          .not('assigned_to_id', 'is', null)
          .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable)');

        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) {
            runningCount[c.assigned_to_id]++;
          }
        });
      }

      function pickNextRep() {
        if (assignmentQueue.length === 0) return null;
        const sorted = [...assignmentQueue].sort(
          (a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0)
        );
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked.id;
      }

      // 4. Create upload record
      const { data: upload, error: upErr } = await supabase
        .from('renewal_uploads')
        .insert({
          agency_id: agencyId,
          uploaded_by: currentUserId,
          filename: uploadFile?.name ?? 'unknown',
          rows_added: toAdd.length,
          rows_updated: updatedCount,
          committed: false,
        })
        .select('id')
        .single();
      if (upErr) throw new Error(upErr.message);

      // 5. Insert new rows (with assignment) and update existing rows separately
      //    Mixing them in a single upsert causes PostgREST to normalize columns,
      //    which either drops assigned_to_id on new rows or nullifies it on existing rows.
      const newRecords = toAdd.map(r => {
        const assignedId = pickNextRep();
        return {
          agency_id: agencyId,
          upload_batch_id: upload.id,
          first_seen_on: today,
          last_seen_on: today,
          ...(assignedId ? { assigned_to_id: assignedId } : {}),
          ...r,
        };
      });

      const existingRows = parsedRows.filter(r => existingKeys.has(`${r.policy_no}|${r.renewal_date}`));

      // Statuses that mean Tracy hasn't meaningfully worked the case yet
      const UNWORKED_STATUSES = new Set(['pending', 'attempting', 'left_voicemail']);

      const updateRecords = existingRows.map(r => {
        const key = `${r.policy_no}|${r.renewal_date}`;
        const currentStatus = existingStatus[key];
        const reportStatus = r.renewal_status; // from parsed row

        // Auto-resolve if: report says resolved AND Tracy hasn't worked it yet
        const shouldAutoResolve =
          REPORT_RESOLVED_STATUSES.has(reportStatus) &&
          UNWORKED_STATUSES.has(currentStatus);

        return {
          agency_id: agencyId,
          upload_batch_id: upload.id,
          last_seen_on: today,
          ...(shouldAutoResolve ? { status: 'auto_resolved' } : {}),
          ...r,
          // Preserve first_seen_on — don't overwrite with today for existing rows
          first_seen_on: undefined,
        };
      });

      if (newRecords.length > 0) {
        const { error: insErr } = await supabase
          .from('renewal_events')
          .upsert(newRecords, { onConflict: 'agency_id,policy_no,renewal_date', ignoreDuplicates: true });
        if (insErr) throw new Error(insErr.message);
      }

      if (updateRecords.length > 0) {
        const { error: updErr } = await supabase
          .from('renewal_events')
          .upsert(updateRecords, { onConflict: 'agency_id,policy_no,renewal_date' });
        if (updErr) throw new Error(updErr.message);
      }

      await supabase.from('renewal_uploads').update({ committed: true }).eq('id', upload.id);

      // 6. Build summary message
      const repNames = assignmentQueue.map(r =>
        r.preferred_name || `${r.first_name || ''} ${r.last_name || ''}`.trim()
      );
      const assignmentSummary = activeReps.length === 0
        ? 'No service reps found — cases unassigned'
        : activeReps.length === 1
        ? `All assigned to ${repNames[0]}`
        : `Distributed across ${repNames.join(', ')}`;

      const autoResolved = updateRecords.filter(r => r.status === 'auto_resolved').length;
      const autoResolvedMsg = autoResolved > 0 ? ` · ${autoResolved} auto-resolved` : '';
      setUploadMsg(`${toAdd.length} added · ${updatedCount} updated${autoResolvedMsg} · ${assignmentSummary}`);
      setParsedRows(null);
      setExcludedCount(0);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['renewal_events', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['policy_retention_status', agencyId] });
    } catch (err) {
      console.error('[renewal commit error]', err.message);
      setUploadError(friendlyUploadError(err.message));
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
        Upload the Allstate <span style={{ fontFamily: "'DM Mono', monospace" }}>Renewal Review</span> report (XLSX).
      </div>

      <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }}
          onChange={e => handleFileSelect(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83D\uDCC4"}</div>
        <div style={{ fontSize: 14, color: "#94A3B8", fontWeight: 500 }}>
          {uploadFile ? uploadFile.name : "Drop renewal report here or click to browse"}
        </div>
        {isParsing && <div style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>Parsing{"\u2026"}</div>}
      </div>

      {/* Assignment info — shown after parsing, before commit */}
      {parsedRows && producers.length > 0 && (
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 12, marginBottom: 12 }}>
          {producers.length === 1
            ? `All new cases will be assigned to ${producers[0].preferred_name || producers[0].first_name}`
            : `New cases will be distributed across ${producers.length} service reps (workload-balanced)`
          }
        </div>
      )}
      {parsedRows && producers.length === 0 && (
        <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 12, marginBottom: 12 }}>
          {"\u26A0"} No active service reps found — cases will be unassigned
        </div>
      )}

      {uploadError && (
        <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#EF4444" }}>
          {uploadError}
        </div>
      )}

      {parsedRows && !uploadMsg && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#F1F5F9", marginBottom: 12 }}>
            Preview — {parsedRows.length} actionable rows
            {excludedCount > 0 && (
              <span style={{ fontWeight: 400, fontSize: 12, color: "#64748B", marginLeft: 8 }}>
                ({excludedCount} already renewed excluded)
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" onClick={handleCommit} disabled={isCommitting}>
              {isCommitting ? "Committing\u2026" : "Confirm & Commit"}
            </button>
            <button className="btn-ghost" onClick={() => { setParsedRows(null); setExcludedCount(0); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {uploadMsg && (
        <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13, color: "#10B981" }}>
          {uploadMsg}
        </div>
      )}
    </div>
  );
}

// ─── Import Tab (unified upload) ──────────────────────────────────────────────

function ImportTab({
  uploadFile, uploadError, uploadMsg, isParsing, isCommitting,
  diffResult, fileInputRef, onFileSelect, onCommit, onCancelUpload,
  cancelAuditFile, cancelAuditError, cancelAuditMsg, isCancelAuditParsing,
  isCancelAuditCommitting, cancelAuditDiff, cancelAuditFileInputRef,
  onCancelAuditFileSelect, onCancelAuditCommit, onCancelAuditCancel,
  agencyId, currentUserId, currentEmployeeId,
}) {
  return (
    <div style={{ maxWidth: 996, margin: '0 auto' }}>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 28, textAlign: 'center' }}>
        Upload Allstate reports to refresh the At Risk queue. Each report is processed independently.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 128, alignItems: 'stretch' }}>

        {/* Left — Pending Cancellation */}
        <div style={{ background: '#161924', border: '1px solid #F59E0B33', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            ⚠ Pending Cancellation Report
          </div>
          <UploadTab
            uploadFile={uploadFile}
            uploadError={uploadError}
            uploadMsg={uploadMsg}
            isParsing={isParsing}
            isCommitting={isCommitting}
            diffResult={diffResult}
            fileInputRef={fileInputRef}
            onFileSelect={onFileSelect}
            onCommit={onCommit}
            onCancel={onCancelUpload}
          />
        </div>

        {/* Right — Renewal Audit */}
        <div style={{ background: '#161924', border: '1px solid #3B82F633', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            🔄 Renewal Audit Report
          </div>
          <RenewalUploadZone
            agencyId={agencyId}
            currentUserId={currentUserId}
            currentEmployeeId={currentEmployeeId}
          />
        </div>

      </div>

      {/* Cancellation Audit — full width below */}
      <div style={{ marginTop: 16, background: '#161924', border: '1px solid #EF444433',
        borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#EF4444',
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
          🚫 Cancellation Audit
        </div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
          Upload the Allstate{' '}
          <span style={{ fontFamily: "'DM Mono', monospace" }}>Cancellation Audit</span> report (XLSX).
          <br />
          <span style={{ color: '#F59E0B' }}>Cancel</span> rows → Stage 1 (pending).{' '}
          <span style={{ color: '#EF4444' }}>Cancelled</span> rows → Stage 2 (coverage lapsed).
        </div>
        <UploadTab
          uploadFile={cancelAuditFile}
          uploadError={cancelAuditError}
          uploadMsg={cancelAuditMsg}
          isParsing={isCancelAuditParsing}
          isCommitting={isCancelAuditCommitting}
          diffResult={cancelAuditDiff}
          fileInputRef={cancelAuditFileInputRef}
          onFileSelect={onCancelAuditFileSelect}
          onCommit={onCancelAuditCommit}
          onCancel={onCancelAuditCancel}
        />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BookHealthPage() {
  const { data: currentAgency } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("at_risk");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sortCol, setSortCol] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const fileInputRef = useRef(null);
  const hasFlaggedBroken = useRef(false);

  // Cancellation Audit upload state
  const [cancelAuditFile, setCancelAuditFile]               = useState(null);
  const [cancelAuditDiff, setCancelAuditDiff]               = useState(null);
  const [cancelAuditMsg, setCancelAuditMsg]                 = useState('');
  const [cancelAuditError, setCancelAuditError]             = useState('');
  const [isCancelAuditParsing, setIsCancelAuditParsing]     = useState(false);
  const [isCancelAuditCommitting, setIsCancelAuditCommitting] = useState(false);
  const cancelAuditFileInputRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  const { data: events = [], isLoading: loading } = useQuery({
    queryKey: ["pending_cancel_events", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_cancel_events")
        .select("*")
        .eq("agency_id", agencyId)
        .order("cancel_effective_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const loadEvents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pending_cancel_events", agencyId] });
  }, [queryClient, agencyId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ─── Resolve current user's employee record (auth UID → employees.id) ─────
  const { data: currentEmployee } = useQuery({
    queryKey: ["current_employee", agencyId, currentUserId],
    queryFn: async () => {
      if (!agencyId || !currentUserId) return null;
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, roles")
        .eq("org_id", agencyId)
        .eq("auth_user_id", currentUserId)
        .maybeSingle();
      return data || null;
    },
    enabled: !!agencyId && !!currentUserId,
    staleTime: 10 * 60 * 1000,
  });

  // ─── Load producers for bulk assign ────────────────────────────────────────

  const { data: producers = [] } = useQuery({
    queryKey: ["producers", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .contains("roles", ["service"])
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Promise-Broken Auto-Flag ──────────────────────────────────────────────

  useEffect(() => {
    if (hasFlaggedBroken.current) return;
    const today = new Date().toISOString().slice(0, 10);
    const broken = events.filter(e =>
      e.status === "promise_to_pay" &&
      e.promise_date &&
      e.promise_date < today
    );
    if (broken.length === 0) return;
    hasFlaggedBroken.current = true;
    Promise.all(
      broken.map(e =>
        supabase.from("pending_cancel_events")
          .update({ status: "promise_broken" })
          .eq("id", e.id)
      )
    ).then(() => loadEvents());
  }, [events, loadEvents]);

  // ─── KPI Calculations ─────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const active = events.filter(e =>
      !["saved","lost","auto_resolved","requested_cancellation"].includes(e.status)
    );
    const saved = events.filter(e => e.status === "saved");
    const lost = events.filter(e => ["lost","promise_broken"].includes(e.status));
    const terminations = events.filter(e => e.status === "requested_cancellation");
    const contacted = events.filter(e =>
      ["contacted","payment_plan_requested","promise_to_pay","saved","promise_broken","requested_cancellation","lost"].includes(e.status)
    );

    const premiumAtRisk = active.reduce((s,e) => s + (e.premium_at_risk || 0), 0);
    const premiumSaved = saved.reduce((s,e) => s + (e.premium_at_risk || 0), 0);

    // workable = saved + lost (lost already includes promise_broken)
    const workable = saved.length + lost.length;
    const saveRate = workable > 0 ? saved.length / workable : null;
    const contactRate = (active.length + contacted.length) > 0
      ? contacted.length / (active.length + contacted.length) : null;

    const today = new Date();
    const urgent = active.filter(e => {
      const d = new Date(e.cancel_effective_date);
      return (d - today) / 86400000 <= 3;
    });

    return {
      totalActive: active.length, premiumAtRisk,
      premiumSaved,
      saveRate, contactRate,
      terminations: terminations.length,
      urgentCount: urgent.length,
    };
  }, [events]);

  // ─── Filtered + Sorted List ────────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    let list = [...events];

    if (statusFilter === "active") {
      list = list.filter(e => !["saved","lost","auto_resolved","requested_cancellation"].includes(e.status));
    } else if (statusFilter === "attempting") {
      list = list.filter(e => ["attempting","left_voicemail"].includes(e.status));
    } else if (statusFilter === "reached") {
      list = list.filter(e => ["contacted","payment_plan_requested","promise_to_pay","promise_broken"].includes(e.status));
    } else if (statusFilter === "resolved") {
      list = list.filter(e => ["saved","lost","auto_resolved","requested_cancellation"].includes(e.status));
    }

    // Add priority scores to each event
    const withScores = list.map(e => ({ ...e, _priority: calcCancelPriority(e) }));

    return withScores.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "priority": av = a._priority || 0; bv = b._priority || 0; break;
        case "cancel_effective_date": av = a.cancel_effective_date; bv = b.cancel_effective_date; break;
        case "customer_name": av = a.customer_name || ""; bv = b.customer_name || ""; break;
        case "premium_at_risk": av = a.premium_at_risk || 0; bv = b.premium_at_risk || 0; break;
        case "product": av = a.product || ""; bv = b.product || ""; break;
        case "cycle": av = a.cycle || 1; bv = b.cycle || 1; break;
        case "attempt_count": av = a.attempt_count || 0; bv = b.attempt_count || 0; break;
        case "status": av = a.status; bv = b.status; break;
        case "assigned_to": av = a.assigned_to || ""; bv = b.assigned_to || ""; break;
        case "promise_date": av = a.promise_date || ""; bv = b.promise_date || ""; break;
        case "days_left": av = daysUntilCancel(a.cancel_effective_date); bv = daysUntilCancel(b.cancel_effective_date); break;
        default: av = a._priority || 0; bv = b._priority || 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [events, statusFilter, sortCol, sortDir]);

  const resolvedEvents = useMemo(() => {
    return events
      .filter(e => ["saved","lost","auto_resolved","requested_cancellation","promise_broken"].includes(e.status))
      .sort((a, b) => (b.resolution_date || b.updated_at || "").localeCompare(a.resolution_date || a.updated_at || ""));
  }, [events]);

  const trendsData = useMemo(() => {
    const months = {};
    for (const e of events) {
      const d = e.cancel_effective_date || e.created_at?.slice(0, 10);
      if (!d) continue;
      const key = d.slice(0, 7);
      if (!months[key]) months[key] = { month: key, cancels: 0, saves: 0, saveRate: 0 };
      months[key].cancels++;
      if (e.status === "saved") months[key].saves++;
    }
    const sorted = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
    for (const m of sorted) {
      m.saveRate = m.cancels > 0 ? Math.round((m.saves / m.cancels) * 100) : 0;
    }
    return sorted;
  }, [events]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      if (col === "days_left") setSortDir("asc");
      else setSortDir("asc");
    }
  }

  // ─── Upload Flow ──────────────────────────────────────────────────────────

  async function handleFileSelect(file) {
    if (!file) return;
    setUploadFile(file);
    setUploadError("");
    setUploadMsg("");
    setDiffResult(null);
    setIsParsing(true);
    try {
      const parsed = await parseReport(file);
      const diff = diffReport(parsed, events);
      setDiffResult(diff);
    } catch (err) {
      console.error("[triage upload error]", err.message);
      setUploadError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsParsing(false);
    }
  }

  async function handleCommitUpload() {
    if (!diffResult || !agencyId || isCommitting) return;
    setIsCommitting(true);
    try {
      // 1. Load active service reps for round-robin assignment
      const { data: reps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .contains("roles", ["service"])
        .order("last_name");

      const activeReps = reps || [];

      // 2. Seed running count with existing caseloads for balanced distribution
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from("pending_cancel_events")
          .select("assigned_to_id")
          .eq("agency_id", agencyId)
          .not("assigned_to_id", "is", null)
          .not("status", "in", '("saved","lost","auto_resolved","requested_cancellation")');

        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) {
            runningCount[c.assigned_to_id]++;
          }
        });
      }

      function pickNextRep() {
        if (activeReps.length === 0) return null;
        const sorted = [...activeReps].sort(
          (a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0)
        );
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked;
      }

      // Create batch record with committed=false; flip to true only after all writes succeed
      const { data: batch, error: batchErr } = await supabase
        .from("pending_cancel_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          filename: uploadFile?.name,
          rows_added: diffResult.toAdd.length,
          rows_updated: diffResult.toUpdate.length,
          rows_auto_resolved: diffResult.toAutoResolve.length,
          committed: false,
        })
        .select().single();
      if (batchErr) throw new Error(batchErr.message);

      const batchId = batch.id;

      if (diffResult.toAdd.length > 0) {
        const { error } = await supabase
          .from("pending_cancel_events")
          .insert(diffResult.toAdd.map(r => {
            const rep = pickNextRep();
            return {
              agency_id: agencyId,
              upload_batch_id: batchId,
              ...(rep ? {
                assigned_to_id: rep.id,
                assigned_to: rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim(),
              } : {}),
              ...r,
            };
          }));
        if (error) throw new Error(error.message);
      }

      for (const u of diffResult.toUpdate) {
        const updatePayload = { last_seen_on: u.last_seen_on, premium_at_risk: u.premium_at_risk };
        if (u.prior_premium != null) updatePayload.prior_premium = u.prior_premium;
        if (u.stage != null)         updatePayload.stage = u.stage;
        if (u.amount_due != null)    updatePayload.amount_due = u.amount_due;
        await supabase
          .from("pending_cancel_events")
          .update(updatePayload)
          .eq("id", u.id);
      }

      if (diffResult.toAutoResolve.length > 0) {
        const ids = diffResult.toAutoResolve.map(r => r.id);
        await supabase
          .from("pending_cancel_events")
          .update({ status: "auto_resolved", resolution_date: new Date().toISOString().slice(0,10) })
          .in("id", ids);
      }

      // All writes succeeded — mark batch as committed
      await supabase
        .from("pending_cancel_uploads")
        .update({ committed: true })
        .eq("id", batchId);

      const repNames = activeReps.map(r =>
        r.preferred_name || `${r.first_name || ""} ${r.last_name || ""}`.trim()
      );
      const assignmentSummary = activeReps.length === 0
        ? "cases unassigned"
        : activeReps.length === 1
        ? `assigned to ${repNames[0]}`
        : `distributed across ${repNames.join(", ")}`;

      setUploadMsg(`${diffResult.toAdd.length} added · ${diffResult.toUpdate.length} updated · ${diffResult.toAutoResolve.length} auto-resolved · ${assignmentSummary}`);
      setDiffResult(null);
      setUploadFile(null);
      await loadEvents();
      queryClient.invalidateQueries({ queryKey: ["policy_retention_status", agencyId] });
    } catch (err) {
      console.error("[triage commit error]", err.message);
      setUploadError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCommitting(false);
    }
  }

  // ─── Cancellation Audit Upload Flow ─────────────────────────────────────────

  async function handleCancelAuditFileSelect(file) {
    if (!file) return;
    setCancelAuditFile(file);
    setCancelAuditError('');
    setCancelAuditMsg('');
    setCancelAuditDiff(null);
    setIsCancelAuditParsing(true);
    try {
      const rows = await parseReport(file);
      const stage1Count = rows.filter(r => r.stage === 'pending_cancel').length;
      const stage2Count = rows.filter(r => r.stage === 'cancelled').length;
      const diff = diffReport(rows, events);
      setCancelAuditDiff({ ...diff, stage1Count, stage2Count });
    } catch (err) {
      setCancelAuditError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCancelAuditParsing(false);
    }
  }

  async function handleCancelAuditCommit() {
    if (!cancelAuditDiff || !agencyId || isCancelAuditCommitting) return;
    setIsCancelAuditCommitting(true);
    try {
      // 1. Load active service reps for round-robin assignment
      const { data: reps } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .contains("roles", ["service"])
        .order("last_name");

      const activeReps = reps || [];

      // 2. Seed running count with existing caseloads
      const runningCount = {};
      if (activeReps.length > 0) {
        const { data: caseloads } = await supabase
          .from("pending_cancel_events")
          .select("assigned_to_id")
          .eq("agency_id", agencyId)
          .not("assigned_to_id", "is", null)
          .not("status", "in", '("saved","lost","auto_resolved","requested_cancellation","cancelled")');

        activeReps.forEach(r => { runningCount[r.id] = 0; });
        (caseloads || []).forEach(c => {
          if (runningCount[c.assigned_to_id] !== undefined) {
            runningCount[c.assigned_to_id]++;
          }
        });
      }

      function pickNextRep() {
        if (activeReps.length === 0) return null;
        const sorted = [...activeReps].sort(
          (a, b) => (runningCount[a.id] || 0) - (runningCount[b.id] || 0)
        );
        const picked = sorted[0];
        runningCount[picked.id] = (runningCount[picked.id] || 0) + 1;
        return picked;
      }

      // 3. Collect parsed policy numbers for stage advancement matching
      const parsedRows = [];
      // Re-parse to get the rows (cancelAuditDiff only has toAdd/toUpdate/etc.)
      // We use the toAdd rows which have stage/amount_due via ...row spread
      const allPolicyNos = [
        ...cancelAuditDiff.toAdd.map(r => r.policy_no),
        ...cancelAuditDiff.toUpdate.map(r => r.policy_no || ''),
      ].filter(Boolean);

      // 4. Stage advancement: find existing events by policy_no only (not composite key)
      // This handles cases where cancel_effective_date differs between Pending Cancel and Cancellation Audit
      const policyNosFromAdd = cancelAuditDiff.toAdd.map(r => r.policy_no).filter(Boolean);
      let stageAdvanceMap = new Map();
      if (policyNosFromAdd.length > 0) {
        const { data: existing } = await supabase
          .from('pending_cancel_events')
          .select('id, policy_no, stage, status, cancel_effective_date')
          .eq('agency_id', agencyId)
          .in('policy_no', policyNosFromAdd)
          .not('status', 'in', '(saved,lost,auto_resolved,cancelled,requested_cancellation)');
        (existing || []).forEach(e => {
          stageAdvanceMap.set(e.policy_no.toLowerCase(), e);
        });
      }

      // 5. Create batch record
      const { data: batch, error: batchErr } = await supabase
        .from("cancellation_uploads")
        .insert({
          agency_id: agencyId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          filename: cancelAuditFile?.name,
          rows_added: 0,
          rows_updated: 0,
          committed: false,
        })
        .select().single();
      if (batchErr) throw new Error(batchErr.message);

      const batchId = batch.id;
      let rowsAdded = 0;
      let rowsUpdated = 0;

      // 6. Process toAdd: check for stage advancement by policy_no
      if (cancelAuditDiff.toAdd.length > 0) {
        const trueInserts = [];
        for (const r of cancelAuditDiff.toAdd) {
          const existingByPolicyNo = stageAdvanceMap.get(r.policy_no.toLowerCase());
          if (existingByPolicyNo) {
            // Stage advancement: update existing record
            const advancePayload = {
              last_seen_on: new Date().toISOString().slice(0, 10),
              ...(r.stage === 'cancelled' ? { stage: 'cancelled' } : {}),
              ...(r.amount_due != null ? { amount_due: r.amount_due } : {}),
              ...(r.cancel_effective_date ? { cancel_effective_date: r.cancel_effective_date } : {}),
              ...(r.premium_at_risk != null ? { premium_at_risk: r.premium_at_risk } : {}),
            };
            await supabase
              .from('pending_cancel_events')
              .update(advancePayload)
              .eq('id', existingByPolicyNo.id);
            rowsUpdated++;
          } else {
            // True insert
            const rep = pickNextRep();
            trueInserts.push({
              agency_id: agencyId,
              upload_batch_id: batchId,
              ...(rep ? {
                assigned_to_id: rep.id,
                assigned_to: rep.preferred_name || `${rep.first_name || ""} ${rep.last_name || ""}`.trim(),
              } : {}),
              ...r,
            });
            rowsAdded++;
          }
        }
        if (trueInserts.length > 0) {
          const { error } = await supabase
            .from("pending_cancel_events")
            .insert(trueInserts);
          if (error) throw new Error(error.message);
        }
      }

      // 7. Process toUpdate (composite key matches)
      for (const u of cancelAuditDiff.toUpdate) {
        const updatePayload = { last_seen_on: u.last_seen_on, premium_at_risk: u.premium_at_risk };
        if (u.prior_premium != null) updatePayload.prior_premium = u.prior_premium;
        if (u.stage != null)         updatePayload.stage = u.stage;
        if (u.amount_due != null)    updatePayload.amount_due = u.amount_due;
        await supabase
          .from("pending_cancel_events")
          .update(updatePayload)
          .eq("id", u.id);
        rowsUpdated++;
      }

      // 8. No auto-resolve for Cancellation Audit — different population than Pending Cancel

      // 9. Mark batch committed
      await supabase
        .from("cancellation_uploads")
        .update({ committed: true, rows_added: rowsAdded, rows_updated: rowsUpdated })
        .eq("id", batchId);

      const repNames = activeReps.map(r =>
        r.preferred_name || `${r.first_name || ""} ${r.last_name || ""}`.trim()
      );
      const assignmentSummary = activeReps.length === 0
        ? "cases unassigned"
        : activeReps.length === 1
        ? `assigned to ${repNames[0]}`
        : `distributed across ${repNames.join(", ")}`;

      setCancelAuditMsg(`${cancelAuditDiff.stage1Count ?? 0} pending · ${cancelAuditDiff.stage2Count ?? 0} lapsed · ${rowsUpdated} updated · ${assignmentSummary}`);
      setCancelAuditDiff(null);
      setCancelAuditFile(null);
      await loadEvents();
      queryClient.invalidateQueries({ queryKey: ["policy_retention_status", agencyId] });
    } catch (err) {
      console.error("[cancel audit commit error]", err.message);
      setCancelAuditError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCancelAuditCommitting(false);
    }
  }

  async function updateEvent(id, updates) {
    const { error } = await supabase
      .from("pending_cancel_events")
      .update(updates)
      .eq("id", id);
    if (!error) {
      queryClient.setQueryData(["pending_cancel_events", agencyId], (prev) =>
        (prev ?? []).map(e => e.id === id ? { ...e, ...updates } : e)
      );
      if (selectedEvent?.id === id) setSelectedEvent(prev => ({ ...prev, ...updates }));
    }
    return error;
  }

  async function bulkAssign(employee) {
    // employee = { id, first_name, last_name, preferred_name }
    const displayName = employee.preferred_name ||
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim();

    const pendingIds = filteredEvents
      .filter(e => e.status === "pending" && !e.assigned_to_id)
      .map(e => e.id);
    if (!pendingIds.length) return;
    await supabase
      .from("pending_cancel_events")
      .update({
        assigned_to_id: employee.id,
        assigned_to:    displayName,  // keep in sync for display
      })
      .in("id", pendingIds);
    await loadEvents();
  }

  // ─── Page Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#E2E8F0", fontFamily: "'DM Sans', sans-serif", padding: "32px 24px" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", margin: 0 }}>Book Health</h1>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>Pending Cancellation · {currentAgency?.agencies?.name || 'Agency'}</div>
      </div>

      {loading && (
        <div style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>Loading events...</div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="At Risk" value={fmt$(kpis.premiumAtRisk)} sub={`${kpis.totalActive} policies`} color="#F59E0B" urgent={kpis.urgentCount > 0} urgentCount={kpis.urgentCount} />
        <KpiCard label="Save Rate" value={kpis.saveRate !== null ? `${Math.round(kpis.saveRate * 100)}%` : "—"} sub="saved / worked" color="#10B981" />
        <KpiCard label="Contact Rate" value={kpis.contactRate !== null ? `${Math.round(kpis.contactRate * 100)}%` : "—"} sub="of active queue" color="#3B82F6" />
        <KpiCard label="Premium Saved" value={fmt$(kpis.premiumSaved)} sub="this period" color="#10B981" />
        <KpiCard label="Terminations" value={kpis.terminations} sub="requested cancel" color="#64748B" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {["at_risk","resolved","attrition","growth","trends","import"].map(t => (
          <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
            {t === "at_risk"   ? "⚡ At Risk"       :
             t === "resolved"  ? "Cancel Outcomes"  :
             t === "attrition" ? "Terminations"     :
             t === "growth"    ? "Net Growth"       :
             t === "trends"    ? "Cancel Trends"    :
                                 "Import"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "at_risk" && (
        <UnifiedAtRiskTab
          agencyId={agencyId}
          currentUserId={currentUserId}
          currentEmployeeId={currentEmployee?.id}
        />
      )}
      {activeTab === "resolved" && <ResolvedTab resolvedEvents={resolvedEvents} />}
      {activeTab === "trends" && <TrendsTab trendsData={trendsData} />}
      {activeTab === "attrition" && (
        <AttritionTab
          agencyId={agencyId}
          currentUserId={currentUserId}
        />
      )}
      {activeTab === "growth" && <NetGrowthTab agencyId={agencyId} />}
      {activeTab === "import" && (
        <ImportTab
          uploadFile={uploadFile}
          uploadError={uploadError}
          uploadMsg={uploadMsg}
          isParsing={isParsing}
          isCommitting={isCommitting}
          diffResult={diffResult}
          fileInputRef={fileInputRef}
          onFileSelect={handleFileSelect}
          onCommit={handleCommitUpload}
          onCancelUpload={() => { setDiffResult(null); setUploadFile(null); setUploadError(''); }}
          cancelAuditFile={cancelAuditFile}
          cancelAuditError={cancelAuditError}
          cancelAuditMsg={cancelAuditMsg}
          isCancelAuditParsing={isCancelAuditParsing}
          isCancelAuditCommitting={isCancelAuditCommitting}
          cancelAuditDiff={cancelAuditDiff}
          cancelAuditFileInputRef={cancelAuditFileInputRef}
          onCancelAuditFileSelect={handleCancelAuditFileSelect}
          onCancelAuditCommit={handleCancelAuditCommit}
          onCancelAuditCancel={() => { setCancelAuditDiff(null); setCancelAuditFile(null); setCancelAuditError(''); }}
          agencyId={agencyId}
          currentUserId={currentUserId}
          currentEmployeeId={currentEmployee?.id ?? null}
        />
      )}

      {/* Detail Modal */}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateEvent}
          agencyId={agencyId}
          currentEmployeeId={currentEmployee?.id ?? null}
          producers={producers}
        />,
        document.body
      )}
    </div>
  );
}
