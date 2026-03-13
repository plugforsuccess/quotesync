import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart, ReferenceLine, Cell } from "recharts";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { useCurrentAgency } from "../hooks/useAgencyLeads";

// ─── Friendly error messages ──────────────────────────────────────────────────
function friendlyUploadError(raw = "") {
  const msg = raw.toLowerCase();

  if (msg.includes("conflict do update command cannot affect row a second time"))
    return "Your report contains duplicate policy numbers. Remove the duplicates and re-upload.";

  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("using expression"))
    return "Permission error — your session may have expired. Please refresh the page and try again.";

  if (msg.includes("unique or exclusion constraint"))
    return "Database configuration error. Please contact your administrator.";

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
const LAPSE_PORTFOLIO_POINTS = {
  auto:          10,
  ho:            20,  // Homeowners — always 1 item per policy
  condo:         20,  // Condo — always 1 item per policy
  renters:        5,
  landlord:      20,  // same points as HO but tracked separately
  specialty_auto: 5,
  pup:            5,  // Personal Umbrella Policy
  manufactured:   5,
  boat:           5,  // Boat Owners — always 1 item per policy
  motor_club:     0,  // Motor Club — not an Allstate VC Baseline product
  other:          0,
};

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
  pending:                { label: "Pending",           color: "#F59E0B", bg: "#F59E0B22" },
  contacted:              { label: "Contacted",         color: "#3B82F6", bg: "#3B82F622" },
  promise_to_pay:         { label: "Promise to Pay",    color: "#8B5CF6", bg: "#8B5CF622" },
  saved:                  { label: "Saved",             color: "#10B981", bg: "#10B98122" },
  promise_broken:         { label: "Promise Broken",    color: "#EF4444", bg: "#EF444422" },
  requested_cancellation: { label: "Termination",       color: "#64748B", bg: "#64748B22" },
  lost:                   { label: "Lost",              color: "#EF4444", bg: "#EF444422" },
  auto_resolved:          { label: "Auto-Resolved",     color: "#475569", bg: "#47556922" },
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
      if (ex.last_seen_on !== today || ex.premium_at_risk !== row.premium_at_risk) {
        toUpdate.push({ id: ex.id, last_seen_on: today, premium_at_risk: row.premium_at_risk, prior_premium: row.prior_premium });
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
      <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{sub}</div>}
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
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
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
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Notes — full width, only if present */}
        {event.notes && (
          <div style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A", marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
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

// ─── Triage Tab ──────────────────────────────────────────────────────────────

function TriageTab({ events, filteredEvents, statusFilter, setStatusFilter, sortCol, sortDir, onSort, setSelectedEvent, producers, bulkAssign }) {
  const [drilldownEvent, setDrilldownEvent] = useState(null);
  const brokenCount = events.filter(e => e.status === "promise_broken").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap", rowGap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["active","all","saved","lost"].map(f => (
            <button key={f} className={`btn-ghost ${statusFilter === f ? "active" : ""}`}
              onClick={() => setStatusFilter(f)}
              style={{ padding: "5px 12px", fontSize: 12 }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: "1 1 auto", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12, color: "#475569" }}>Bulk assign unassigned pending:</span>
          {producers.map(p => {
            const name = p.preferred_name || p.first_name;
            return (
              <button key={p.id} className="btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() => bulkAssign(name)}>
                → {name}
              </button>
            );
          })}
        </div>
      </div>

      {brokenCount > 0 && (
        <div style={{ background: "#EF444411", border: "1px solid #EF444433", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>
          {brokenCount} broken promise{brokenCount > 1 ? "s" : ""} — follow up needed
        </div>
      )}

      <div className="scroll-hint-container">
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <SortTh col="cancel_effective_date" label="Cancel Date" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortTh col="days_left" label="Days Left" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortTh col="customer_name" label="Customer" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <th>Product</th>
                <SortTh col="premium_at_risk" label="Premium" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortTh col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortTh col="assigned_to" label="Assigned" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <th>Promise Date</th>
              </tr>
            </thead>
          <tbody>
            {filteredEvents.map(event => {
              const days = daysUntilCancel(event.cancel_effective_date);
              const sc = STATUS_CONFIG[event.status] || STATUS_CONFIG.pending;
              return (
                <tr key={event.id} className="triage-row" onClick={() => setSelectedEvent(event)}>
                  <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    {event.cancel_effective_date}
                  </td>
                  <td>
                    <span className="urgency-badge" style={{ background: `${urgencyColor(days)}22`, color: urgencyColor(days) }}>
                      {days <= 0 ? "PAST DUE" : `${days}d`}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={e => { e.stopPropagation(); setDrilldownEvent(event); }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#E2E8F0", fontWeight: 600, fontSize: 13,
                        padding: 0, fontFamily: "inherit",
                        textDecoration: "underline", textDecorationColor: "transparent",
                        transition: "text-decoration-color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.textDecorationColor = "#3B82F6"}
                      onMouseLeave={e => e.currentTarget.style.textDecorationColor = "transparent"}
                    >
                      {maskCustomerName(event.customer_name)}
                    </button>
                  </td>
                  <td style={{ color: "#94A3B8", fontSize: 12 }}>{event.product?.toUpperCase() || "—"}</td>
                  <td style={{ color: "#E2E8F0", fontFamily: "'DM Mono', monospace" }}>
                    {event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "—"}
                  </td>
                  <td>
                    <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td style={{ color: "#64748B", fontSize: 12 }}>{event.assigned_to || "—"}</td>
                  <td style={{ color: event.promise_date ? "#8B5CF6" : "#334155", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    {event.promise_date || "—"}
                  </td>
                </tr>
              );
            })}
            {filteredEvents.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#334155", padding: "32px 0" }}>
                No events in this filter
              </td></tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {drilldownEvent && (
        <CustomerDrilldownModal
          event={drilldownEvent}
          onClose={() => setDrilldownEvent(null)}
        />
      )}
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
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>
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
        {isParsing && <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>Parsing\u2026</div>}
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
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>

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

function EventDetailModal({ event, onClose, onUpdate }) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    status: event.status,
    assigned_to: event.assigned_to || "",
    contact_method: event.contact_method || "",
    promise_date: event.promise_date || "",
    termination_reason: event.termination_reason || "",
    notes: event.notes || "",
  });

  async function save() {
    setSaving(true);
    const updates = { ...form };
    if (["contacted","promise_to_pay"].includes(form.status) && !event.contacted_at) {
      updates.contacted_at = new Date().toISOString();
    }
    if (["saved","lost","requested_cancellation"].includes(form.status) && !event.resolution_date) {
      updates.resolution_date = new Date().toISOString().slice(0,10);
    }
    await onUpdate(event.id, updates);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: 14, width: "100%", maxWidth: "98vw", height: "96vh", overflow: "auto", padding: "24px 20px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{maskCustomerName(event.customer_name) || "Unknown Customer"}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
              Policy {event.policy_no} · {event.product?.toUpperCase()} · Cycle {event.cycle}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Cancel Date", value: event.cancel_effective_date, color: urgencyColor(days) },
            { label: "Days Left", value: days <= 0 ? "PAST DUE" : `${days} days`, color: urgencyColor(days) },
            { label: "Premium", value: event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "—", color: "#E2E8F0" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: "10px 12px", border: "1px solid #252A3A" }}>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div>
              <label>Status</label>
              <select value={form.status} onChange={ev => setForm(p => ({ ...p, status: ev.target.value }))}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Contact Method</label>
              <select value={form.contact_method} onChange={ev => setForm(p => ({ ...p, contact_method: ev.target.value }))}>
                <option value="">—</option>
                {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div>
              <label>Assigned To</label>
              <input type="text" value={form.assigned_to}
                onChange={ev => setForm(p => ({ ...p, assigned_to: ev.target.value }))}
                placeholder="Producer name" />
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
  const [refreshKey, setRefreshKey] = useState(0);

  // Monthly summary data
  const [monthlySummary, setMonthlySummary] = useState([]); // [{report_month, items, points, premium}]
  const [loading, setLoading] = useState(true);
  const lapseFileRef = useRef();
  const mountId = useRef(0);

  // Load monthly summary on mount and after each commit
  useEffect(() => {
    // Increment on every mount so the effect always re-runs even if agencyId
    // hasn't changed (e.g. after external data truncation or tab switch)
    mountId.current += 1;
    const thisMount = mountId.current;

    if (!agencyId) return;

    setMonthlySummary([]); // clear immediately so stale rows aren't visible during fetch
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("lapse_events")
          .select("report_month, product, premium, item_count")
          .eq("agency_id", agencyId)
          .order("report_month", { ascending: false });

        // Bail if a newer mount has already taken over
        if (thisMount !== mountId.current) return;

        if (error) {
          console.error("[attrition fetch error]", error.message);
          setMonthlySummary([]);
        } else if (data) {
          const byMonth = {};
          data.forEach(r => {
            const m = r.report_month;
            if (!byMonth[m]) byMonth[m] = { report_month: m, items: 0, points: 0, premium: 0 };
            byMonth[m].items += r.item_count ?? 1;
            byMonth[m].points += (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
            byMonth[m].premium += r.premium ?? 0;
          });
          setMonthlySummary(Object.values(byMonth).sort((a, b) => b.report_month.localeCompare(a.report_month)));
        } else {
          setMonthlySummary([]);
        }
      } catch (err) {
        console.error("[attrition fetch error]", err);
        if (thisMount === mountId.current) setMonthlySummary([]);
      } finally {
        if (thisMount === mountId.current) setLoading(false);
      }
    })();
  }, [agencyId, refreshKey]); // refreshKey still triggers re-fetch after commit

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
      setRefreshKey(k => k + 1);
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
        <div style={{ color: "#475569", fontSize: 13, marginBottom: 20 }}>Loading attrition history\u2026</div>
      ) : monthlySummary.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Attrition History</div>
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
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 20 }}>No attrition history yet. Upload your first report below.</div>
      )}

      {/* Upload Section */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Upload Termination Report</div>

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
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
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

const GLOBAL_STYLES = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1A1D27; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; } input, select { background: #1E2130 !important; color: #E2E8F0 !important; border: 1px solid #2D3348 !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: #3B82F6 !important; } .card { background: #161924; border: 1px solid #252A3A; border-radius: 12px; padding: 20px; } .btn-primary { background: #3B82F6; color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: #94A3B8; border: 1px solid #2D3348; border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: #1E2130; color: #E2E8F0; border-color: #3B82F6; } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: #64748B; transition: all 0.15s; } .tab.active { background: #1E2130; color: #E2E8F0; } .upload-zone { border: 2px dashed #2D3348; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: #3B82F6; } label { font-size: 12px; color: #64748B; font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 13px; } th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252A3A; } td { padding: 9px 12px; border-bottom: 1px solid #1A1D27; color: #94A3B8; } .urgency-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; font-family: 'DM Mono', monospace; } .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; } .triage-row:hover td { background: #1A1D27; cursor: pointer; } .scroll-hint-container { position: relative; } .scroll-hint-container::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px; background: linear-gradient(to right, transparent, #0f172a); pointer-events: none; opacity: 1; transition: opacity 0.2s; } @media (min-width: 840px) { .scroll-hint-container::after { opacity: 0; } }`;

// ─── Net Portfolio Growth Tab ──────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function NetGrowthTab({ agencyId }) {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
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

      if (cancelled) return;

      const monthMap = {};
      const ensure = (m) => {
        if (!monthMap[m]) monthMap[m] = {
          month: m,
          nb_points: 0, nb_items: 0, nb_premium: 0,
          lapse_points: 0, lapse_items: 0, lapse_premium: 0,
        };
      };

      nbRows?.forEach(r => {
        const m = r.issued_date?.slice(0, 7);
        if (!m) return;
        ensure(m);
        const pts = (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
        monthMap[m].nb_points   += pts;
        monthMap[m].nb_items    += r.item_count ?? 1;
        monthMap[m].nb_premium  += r.premium ?? 0;
      });

      lapseRows?.forEach(r => {
        const m = r.report_month?.slice(0, 7);
        if (!m) return;
        ensure(m);
        const pts = (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
        monthMap[m].lapse_points   += pts;
        monthMap[m].lapse_items    += r.item_count ?? 1;
        monthMap[m].lapse_premium  += r.premium ?? 0;
      });

      const sorted = Object.values(monthMap)
        .map(m => ({ ...m, net_points: m.nb_points - m.lapse_points }))
        .sort((a, b) => a.month.localeCompare(b.month));

      setMonths(sorted);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [agencyId]);

  if (loading) {
    return <div style={{ color: "#64748B", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Loading…</div>;
  }

  if (months.length === 0) {
    return (
      <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
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
          <div style={{ fontSize: 22, fontWeight: 700, color: cur ? (cur.net_points > 0 ? "#10B981" : cur.net_points < 0 ? "#EF4444" : "#475569") : "#475569" }}>
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
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
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
            <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
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
                <td style={{ textAlign: "right", color: m.net_points > 0 ? "#10B981" : m.net_points < 0 ? "#EF4444" : "#475569" }}>
                  {m.net_points.toLocaleString()}
                </td>
                <td style={{
                  textAlign: "right",
                  fontFamily: "'DM Mono', monospace",
                  color: m.net_items > 0 ? "#10B981" : m.net_items < 0 ? "#EF4444" : "#475569",
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
                    : "#475569",
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
              <td style={{ textAlign: "right", color: totals.net_points > 0 ? "#10B981" : totals.net_points < 0 ? "#EF4444" : "#475569" }}>
                {totals.net_points.toLocaleString()}
              </td>
              <td style={{
                textAlign: "right",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                color: totalNetItems > 0 ? "#10B981" : totalNetItems < 0 ? "#EF4444" : "#475569",
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BookHealthPage() {
  const { data: currentAgency } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("triage");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sortCol, setSortCol] = useState("cancel_effective_date");
  const [sortDir, setSortDir] = useState("asc");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [uploadMsg, setUploadMsg] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const fileInputRef = useRef(null);
  const hasFlaggedBroken = useRef(false);
  const [producers, setProducers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  const loadEvents = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pending_cancel_events")
      .select("*")
      .eq("agency_id", agencyId)
      .order("cancel_effective_date", { ascending: true });
    if (!error) setEvents(data ?? []);
    setLoading(false);
  }, [agencyId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ─── Load producers for bulk assign ────────────────────────────────────────

  useEffect(() => {
    if (!agencyId) return;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, preferred_name")
        .eq("org_id", agencyId)
        .eq("employment_status", "active")
        .eq("role_type", "service")
        .order("last_name");
      if (data) setProducers(data);
    })();
  }, [agencyId]);

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
      ["pending","contacted","promise_to_pay","promise_broken"].includes(e.status)
    );
    const saved = events.filter(e => e.status === "saved");
    const lost = events.filter(e => ["lost","promise_broken"].includes(e.status));
    const terminations = events.filter(e => e.status === "requested_cancellation");
    const contacted = events.filter(e =>
      ["contacted","promise_to_pay","saved","promise_broken","requested_cancellation","lost"].includes(e.status)
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
      list = list.filter(e => ["pending","contacted","promise_to_pay","promise_broken"].includes(e.status));
    } else if (statusFilter === "saved") {
      list = list.filter(e => e.status === "saved");
    } else if (statusFilter === "lost") {
      list = list.filter(e => ["lost","promise_broken","requested_cancellation"].includes(e.status));
    }

    return list.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "cancel_effective_date": av = a.cancel_effective_date; bv = b.cancel_effective_date; break;
        case "customer_name": av = a.customer_name || ""; bv = b.customer_name || ""; break;
        case "premium_at_risk": av = a.premium_at_risk || 0; bv = b.premium_at_risk || 0; break;
        case "status": av = a.status; bv = b.status; break;
        case "assigned_to": av = a.assigned_to || ""; bv = b.assigned_to || ""; break;
        case "days_left": av = daysUntilCancel(a.cancel_effective_date); bv = daysUntilCancel(b.cancel_effective_date); break;
        default: av = a.cancel_effective_date; bv = b.cancel_effective_date;
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
    if (!diffResult || isCommitting) return;
    setIsCommitting(true);
    try {
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
          .insert(diffResult.toAdd.map(r => ({
            agency_id: agencyId,
            upload_batch_id: batchId,
            ...r,
          })));
        if (error) throw new Error(error.message);
      }

      for (const u of diffResult.toUpdate) {
        const updatePayload = { last_seen_on: u.last_seen_on, premium_at_risk: u.premium_at_risk };
        if (u.prior_premium != null) updatePayload.prior_premium = u.prior_premium;
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

      setUploadMsg(`${diffResult.toAdd.length} added · ${diffResult.toUpdate.length} updated · ${diffResult.toAutoResolve.length} auto-resolved`);
      setDiffResult(null);
      setUploadFile(null);
      await loadEvents();
    } catch (err) {
      console.error("[triage commit error]", err.message);
      setUploadError(`❌ ${friendlyUploadError(err.message)}`);
    } finally {
      setIsCommitting(false);
    }
  }

  async function updateEvent(id, updates) {
    const { error } = await supabase
      .from("pending_cancel_events")
      .update(updates)
      .eq("id", id);
    if (!error) {
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      if (selectedEvent?.id === id) setSelectedEvent(prev => ({ ...prev, ...updates }));
    }
    return error;
  }

  async function bulkAssign(producerName) {
    const pendingIds = filteredEvents
      .filter(e => e.status === "pending" && !e.assigned_to)
      .map(e => e.id);
    if (!pendingIds.length) return;
    await supabase
      .from("pending_cancel_events")
      .update({ assigned_to: producerName })
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
        <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>Pending Cancellation · Wiley-Wilson Agency</div>
      </div>

      {loading && (
        <div style={{ color: "#475569", fontSize: 13, marginBottom: 12 }}>Loading events...</div>
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
        {["triage","resolved","upload","trends","attrition","growth"].map(t => (
          <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
            {t === "triage" ? "Triage" : t === "resolved" ? "Resolved" : t === "upload" ? "Upload" :
             t === "trends" ? "Trends" : t === "attrition" ? "Attrition" : "Portfolio Growth"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "triage" && (
        <TriageTab
          events={events}
          filteredEvents={filteredEvents}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          setSelectedEvent={setSelectedEvent}
          producers={producers}
          bulkAssign={bulkAssign}
        />
      )}
      {activeTab === "resolved" && <ResolvedTab resolvedEvents={resolvedEvents} />}
      {activeTab === "upload" && (
        <UploadTab
          uploadFile={uploadFile}
          uploadError={uploadError}
          uploadMsg={uploadMsg}
          isParsing={isParsing}
          isCommitting={isCommitting}
          diffResult={diffResult}
          fileInputRef={fileInputRef}
          onFileSelect={handleFileSelect}
          onCommit={handleCommitUpload}
          onCancel={() => { setDiffResult(null); setUploadFile(null); }}
        />
      )}
      {activeTab === "trends" && <TrendsTab trendsData={trendsData} />}
      {activeTab === "attrition" && (
        <AttritionTab
          agencyId={agencyId}
          currentUserId={currentUserId}
        />
      )}
      {activeTab === "growth" && <NetGrowthTab agencyId={agencyId} />}

      {/* Detail Modal */}
      {selectedEvent && createPortal(
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdate={updateEvent}
        />,
        document.body
      )}
    </div>
  );
}
