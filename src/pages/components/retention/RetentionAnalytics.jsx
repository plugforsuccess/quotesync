// src/pages/components/retention/RetentionAnalytics.jsx
// Extracted from BookHealthPage.jsx — analytics/reporting tabs.

import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart, ReferenceLine, Cell } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAgencyProductConfig } from '../../../hooks/useAgencyProductConfig';

function friendlyUploadError(raw = "") {
  const msg = raw.toLowerCase();
  if (msg.includes("no rows") || msg.includes("empty")) return "The file appears empty or has no data rows.";
  if (msg.includes("header") || msg.includes("column")) return "Could not find expected column headers. Check that the file matches the expected format.";
  if (msg.includes("permission") || msg.includes("denied")) return "Permission denied. You may not have access to upload for this agency.";
  if (msg.includes("duplicate")) return "Duplicate records detected — some rows may already exist.";
  if (msg.includes("network") || msg.includes("fetch")) return "Network error — check your connection and try again.";
  return raw || "An unexpected error occurred.";
}

// ─── Product normaliser ─────────────────────────────────────────────────────

const PRODUCT_ALIASES = {
  "House & Home":  "ho",   "Homeowners": "ho",   HO: "ho",   "HO3": "ho",
  "Auto":          "auto", "Private Passenger Auto": "auto", "PPA": "auto",
  "Condo":         "condo", "Condominium": "condo",
  "Renters":       "renters", "Tenants": "renters",
  "Landlord Protection": "landlord", "Landlord": "landlord",
  "PUP":           "pup",  "Umbrella": "pup",
  "Manufactured Home": "manufactured",
  "Boat":          "boat", "Watercraft": "boat",
  "Motor Club":    "motor_club",
};

function normaliseProduct(raw = "") {
  const trimmed = raw.trim();
  const found = PRODUCT_ALIASES[trimmed];
  if (found) return found;
  const lower = trimmed.toLowerCase();
  if (lower.includes("home"))       return "ho";
  if (lower.includes("auto") || lower.includes("ppa")) return "auto";
  if (lower.includes("condo"))      return "condo";
  if (lower.includes("renter"))     return "renters";
  if (lower.includes("landlord"))   return "landlord";
  if (lower.includes("umbrella") || lower.includes("pup")) return "pup";
  if (lower.includes("manufactured")) return "manufactured";
  if (lower.includes("boat") || lower.includes("watercraft")) return "boat";
  if (lower.includes("motor"))      return "motor_club";
  return lower || "unknown";
}

// ─── Lapse XLSX parser ──────────────────────────────────────────────────────

function parseLapseXLSX(data) {
  const wb = XLSX.read(data, { type: "array" });
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  if (allRows.length < 2) return [];

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

function fmt$(n) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString();
}

function fmtFull$(n) {
  if (n == null || isNaN(n)) return "$0.00";
  return "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const STATUS_CONFIG = {
  pending:             { label: "New",             bg: "#1E293B", fg: "#F59E0B" },
  attempting:          { label: "Attempting",       bg: "#1E293B", fg: "#F97316" },
  left_voicemail:      { label: "Left VM",         bg: "#1E293B", fg: "#FB923C" },
  contacted:           { label: "Contacted",        bg: "#1E293B", fg: "#38BDF8" },
  payment_plan_requested: { label: "Pmt Plan Req",  bg: "#1E293B", fg: "#818CF8" },
  promise_to_pay:      { label: "Promise-to-Pay",  bg: "#1E293B", fg: "#A78BFA" },
  promise_broken:      { label: "Promise Broken",  bg: "#1E293B", fg: "#F87171" },
  saved:               { label: "Saved",           bg: "#064E3B", fg: "#34D399" },
  lost:                { label: "Lost",            bg: "#7F1D1D", fg: "#FCA5A5" },
  auto_resolved:       { label: "Auto-Resolved",   bg: "#1E293B", fg: "#94A3B8" },
  requested_cancellation: { label: "Termination",  bg: "#1E293B", fg: "#64748B" },
};

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
                  <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    {event.resolution_date || event.updated_at?.slice(0, 10) || "—"}
                  </td>
                  <td style={{ color: "var(--qs-text)", fontWeight: 500 }}>{maskCustomerName(event.customer_name)}</td>
                  <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{event.policy_no}</td>
                  <td style={{ color: "var(--qs-dim)", fontSize: 12 }}>{event.product?.toUpperCase() || "—"}</td>
                  <td style={{ color: "var(--qs-text)", fontFamily: "'DM Mono', monospace" }}>
                    {event.premium_at_risk ? fmtFull$(event.premium_at_risk) : "—"}
                  </td>
                  <td>
                    <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  <td style={{ color: "var(--qs-subtle)", fontSize: 12 }}>{event.assigned_to || "—"}</td>
                  <td style={{ color: "var(--qs-subtle)", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.notes || "—"}
                  </td>
                </tr>
              );
            })}
            {resolvedEvents.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--qs-muted)", padding: "32px 0" }}>
                No resolved events yet
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendsTab({ trendsData }) {
  if (trendsData.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--qs-muted)", padding: "48px 0" }}>
        No data yet. Upload reports to see trends.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-bright)", marginBottom: 16 }}>Monthly Cancel Volume & Save Rate</div>
      <div className="card" style={{ padding: "20px 12px" }}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252A3A" />{/* Recharts SVG attribute — hex required */}
            <XAxis dataKey="month" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} />{/* Recharts SVG attribute — hex required */}
            <YAxis yAxisId="left" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} />{/* Recharts SVG attribute — hex required */}
            <YAxis yAxisId="right" orientation="right" stroke="#64748B" tick={{ fill: "#64748B", fontSize: 11 }} domain={[0, 100]} unit="%" />{/* Recharts SVG attribute — hex required */}
            <Tooltip
              contentStyle={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, fontSize: 12, color: "var(--qs-text)" }}
              labelStyle={{ color: "var(--qs-dim)" }}
              itemStyle={{ color: "var(--qs-text)" }}
            />
            <Bar yAxisId="left" dataKey="cancels" name="Cancels" fill="#EF4444" radius={[4, 4, 0, 0]} opacity={0.7} />{/* Recharts SVG attribute — hex required */}
            <Bar yAxisId="left" dataKey="saves" name="Saves" fill="#10B981" radius={[4, 4, 0, 0]} />{/* Recharts SVG attribute — hex required */}
            <Line yAxisId="right" type="monotone" dataKey="saveRate" name="Save Rate %" stroke="#F59E0B" strokeWidth={2} dot={{ fill: "#F59E0B", r: 3 }} />{/* Recharts SVG attribute — hex required */}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AttritionTab({ agencyId, currentUserId }) {
  const { config: productConfig } = useAgencyProductConfig(agencyId);
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
        byMonth[m].points += (productConfig.portfolioPoints[r.product] ?? 0) * (r.item_count ?? 1);
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
        <div style={{ background: gapAnalysis.pointsDelta > 0 ? "var(--qs-danger-subtle)" : "var(--qs-success-subtle)", border: `1px solid ${gapAnalysis.pointsDelta > 0 ? "var(--qs-danger-border)" : "var(--qs-success-border)"}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: gapAnalysis.pointsDelta > 0 ? "var(--qs-danger)" : "var(--qs-success)", marginBottom: 4 }}>
            {gapAnalysis.pointsDelta > 0
              ? `⚠ Attrition increased — ${gapAnalysis.currentMonth}: ${gapAnalysis.currentPoints} pts lost · New business must exceed this next month to grow`
              : `✓ Attrition decreased vs prior month`}
          </div>
          <div style={{ fontSize: 12, color: "var(--qs-subtle)" }}>
            {gapAnalysis.priorMonth}: {gapAnalysis.priorItems} items · {gapAnalysis.priorPoints} pts lost &nbsp;→&nbsp;
            {gapAnalysis.currentMonth}: {gapAnalysis.currentItems} items · {gapAnalysis.currentPoints} pts lost
            &nbsp;({gapAnalysis.pointsDelta >= 0 ? "+" : ""}{gapAnalysis.pointsDelta} pts)
          </div>
        </div>
      )}
      {gapAnalysis?.isPartialMonth && (
        <div style={{
          fontSize: 11,
          color: "var(--qs-warning)",
          background: "var(--qs-warning-subtle)",
          border: "1px solid var(--qs-warning-border)",
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
        <div style={{ color: "var(--qs-subtle)", fontSize: 13, marginBottom: 20 }}>Loading attrition history\u2026</div>
      ) : monthlySummary.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Attrition History</div>
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
                      <td style={{ color: "var(--qs-text)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{row.report_month.slice(0, 7)}</td>
                      <td style={{ color: "var(--qs-bright)", fontWeight: 600 }}>{row.items}</td>
                      <td style={{ color: "var(--qs-warning)", fontWeight: 600 }}>{row.points}</td>
                      <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>${Math.round(row.premium).toLocaleString()}</td>
                      <td style={{ color: itemsDelta == null ? "var(--qs-muted)" : itemsDelta > 0 ? "var(--qs-danger)" : "var(--qs-success)", fontSize: 12 }}>
                        {itemsDelta == null ? "—" : `${itemsDelta >= 0 ? "+" : ""}${itemsDelta}`}
                      </td>
                      <td style={{ color: pointsDelta == null ? "var(--qs-muted)" : pointsDelta > 0 ? "var(--qs-danger)" : "var(--qs-success)", fontSize: 12 }}>
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
        <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 20 }}>No attrition history yet. Upload your first report below.</div>
      )}

      {/* Upload Section */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Upload Termination Report</div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--qs-subtle)", display: "block", marginBottom: 4 }}>Report Month</label>
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
        <div style={{ background: "var(--qs-danger-subtle)", border: "1px solid var(--qs-danger-border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--qs-danger)" }}>
          {parseError}
        </div>
      )}

      {/* Preview */}
      {preview && !commitMsg && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-bright)", marginBottom: 12 }}>Preview — {reportMonth.slice(0, 7)}</div>
          {/* Detail grid — color values used as inline style props */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Items Lost", value: preview.items, color: "#EF4444" },
              { label: "Points Lost", value: preview.points, color: "#F59E0B" },
              { label: "Premium Lost", value: `$${Math.round(preview.premium).toLocaleString()}`, color: "#94A3B8" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "var(--qs-subtle)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>
          {/* Product breakdown */}
          <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginBottom: 16 }}>
            {Object.entries(preview.byProduct).map(([prod, count]) => (
              <span key={prod} style={{ marginRight: 12 }}>{prod}: <strong style={{ color: "var(--qs-dim)" }}>{count}</strong></span>
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
        <div style={{ background: "var(--qs-success-subtle)", border: "1px solid var(--qs-success-border)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--qs-success)" }}>
          {commitMsg}
        </div>
      )}
    </div>
  );
}

// ─── Global Styles ─────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--qs-elevated); } ::-webkit-scrollbar-thumb { background: var(--qs-muted); border-radius: 3px; } input, select { background: var(--qs-elevated) !important; color: var(--qs-text) !important; border: 1px solid var(--qs-border) !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: var(--qs-info) !important; } .card { background: var(--qs-card); border: 1px solid var(--qs-border); border-radius: 12px; padding: 20px; } .btn-primary { background: var(--qs-info); color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: var(--qs-dim); border: 1px solid var(--qs-border); border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: var(--qs-elevated); color: var(--qs-text); border-color: var(--qs-info); } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: var(--qs-subtle); transition: all 0.15s; } .tab.active { background: var(--qs-elevated); color: var(--qs-text); } .upload-zone { border: 2px dashed var(--qs-border); border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: var(--qs-info); } label { font-size: 12px; color: var(--qs-subtle); font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--qs-subtle); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--qs-border); } td { padding: 9px 12px; border-bottom: 1px solid var(--qs-elevated); color: var(--qs-text); } .urgency-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; font-family: 'DM Mono', monospace; } .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; } .triage-row:hover td { background: var(--qs-elevated); cursor: pointer; } .scroll-hint-container { position: relative; } .scroll-hint-container::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px; background: linear-gradient(to right, transparent, var(--qs-dark)); pointer-events: none; opacity: 1; transition: opacity 0.2s; } @media (min-width: 840px) { .scroll-hint-container::after { opacity: 0; } }`;

// ─── Net Portfolio Growth Tab ──────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


function NetGrowthTab({ agencyId }) {
  const { config: productConfig } = useAgencyProductConfig(agencyId);
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
        const pts = (productConfig.portfolioPoints[r.product] ?? 0) * (r.item_count ?? 1);
        monthMap[m].nb_points   += pts;
        monthMap[m].nb_items    += r.item_count ?? 1;
        monthMap[m].nb_premium  += r.premium ?? 0;
      });

      (lapseRows ?? []).forEach(r => {
        const m = r.report_month?.slice(0, 7);
        if (!m) return;
        ensure(m);
        const pts = (productConfig.portfolioPoints[r.product] ?? 0) * (r.item_count ?? 1);
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
    return <div style={{ color: "var(--qs-subtle)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>Loading…</div>;
  }

  if (months.length === 0) {
    return (
      <div style={{ color: "var(--qs-subtle)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
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
        <div style={{ flex: 1, background: "var(--qs-elevated)", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Points Gained</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--qs-success)" }}>
            {cur && cur.nb_points > 0 ? cur.nb_points.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ flex: 1, background: "var(--qs-elevated)", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Points Lost</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--qs-danger)" }}>
            {cur && cur.lapse_points > 0 ? cur.lapse_points.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ flex: 1, background: "var(--qs-elevated)", borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Net Points</div>
          {/* Dynamic color — used as style prop */}
          <div style={{ fontSize: 22, fontWeight: 700, color: cur ? (cur.net_points > 0 ? "var(--qs-success)" : cur.net_points < 0 ? "var(--qs-danger)" : "var(--qs-subtle)") : "var(--qs-subtle)" }}>
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
            tick={{ fill: "#64748B", fontSize: 11 }} /* Recharts SVG attribute — hex required */
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            labelFormatter={fmtMonth}
            contentStyle={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, fontSize: 12, color: "var(--qs-text)" }}
            labelStyle={{ color: "var(--qs-dim)" }}
            itemStyle={{ color: "var(--qs-text)" }}
            formatter={(value, name) => [value, name === "nb_points" ? "Points Gained" : name === "lapse_points" ? "Points Lost" : "Net"]}
          />
          <ReferenceLine y={0} stroke="#334155" />{/* Recharts SVG attribute — hex required */}
          <Bar dataKey="nb_points" name="nb_points" fill="#10B981" radius={[3,3,0,0]} maxBarSize={28} />{/* Recharts SVG attribute — hex required */}
          <Bar dataKey="lapse_points" name="lapse_points" fill="#EF4444" radius={[3,3,0,0]} maxBarSize={28} />{/* Recharts SVG attribute — hex required */}
        </BarChart>
      </ResponsiveContainer>

      {/* Net Points Line Chart */}
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" hide />
            <YAxis tick={{ fill: "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />{/* Recharts SVG attribute — hex required */}
            <Tooltip
              labelFormatter={fmtMonth}
              contentStyle={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, fontSize: 12, color: "var(--qs-text)" }}
              labelStyle={{ color: "var(--qs-dim)" }}
              itemStyle={{ color: "var(--qs-text)" }}
              formatter={(value) => [value, "Net Points"]}
            />
            <Line
              type="monotone"
              dataKey="net_points"
              stroke="#3B82F6" // Recharts SVG attribute — hex required
              strokeWidth={2}
              dot={({ cx, cy, payload }) => (
                <circle key={payload.month} cx={cx} cy={cy} r={4}
                  fill={payload.net_points >= 0 ? "#10B981" : "#EF4444"} // Recharts SVG attribute — hex required
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
              <tr key={m.month} style={m.month === curMonth ? { borderLeft: "2px solid var(--qs-info)" } : undefined}>
                <td style={{ fontWeight: 500, color: "var(--qs-text)" }}>{fmtMonth(m.month)}</td>
                <td style={{ textAlign: "right", color: "var(--qs-success)" }}>{m.nb_points.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: "var(--qs-danger)" }}>{m.lapse_points.toLocaleString()}</td>
                <td style={{ textAlign: "right", color: m.net_points > 0 ? "var(--qs-success)" : m.net_points < 0 ? "var(--qs-danger)" : "var(--qs-subtle)" }}>
                  {m.net_points.toLocaleString()}
                </td>
                <td style={{
                  textAlign: "right",
                  fontFamily: "'DM Mono', monospace",
                  color: m.net_items > 0 ? "var(--qs-success)" : m.net_items < 0 ? "var(--qs-danger)" : "var(--qs-subtle)",
                  fontWeight: 600,
                }}>
                  {m.net_items > 0 ? `+${m.net_items}` : String(m.net_items)}
                </td>
                <td style={{
                  textAlign: "right",
                  fontFamily: "'DM Mono', monospace",
                  color: m.net_ytd === null
                    ? "var(--qs-muted)"
                    : m.net_ytd > 0 ? "var(--qs-success)"
                    : m.net_ytd < 0 ? "var(--qs-danger)"
                    : "var(--qs-subtle)",
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
            <tr style={{ borderTop: "2px solid var(--qs-border)", fontWeight: 600 }}>
              <td style={{ color: "var(--qs-text)" }}>Total</td>
              <td style={{ textAlign: "right", color: "var(--qs-success)" }}>{totals.nb_points.toLocaleString()}</td>
              <td style={{ textAlign: "right", color: "var(--qs-danger)" }}>{totals.lapse_points.toLocaleString()}</td>
              <td style={{ textAlign: "right", color: totals.net_points > 0 ? "var(--qs-success)" : totals.net_points < 0 ? "var(--qs-danger)" : "var(--qs-subtle)" }}>
                {totals.net_points.toLocaleString()}
              </td>
              <td style={{
                textAlign: "right",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                color: totalNetItems > 0 ? "var(--qs-success)" : totalNetItems < 0 ? "var(--qs-danger)" : "var(--qs-subtle)",
              }}>
                {totalNetItems > 0 ? `+${totalNetItems}` : String(totalNetItems)}
              </td>
              <td style={{
                textAlign: "right",
                fontFamily: "'DM Mono', monospace",
                fontWeight: 700,
                color: finalNetYTD === null ? "var(--qs-muted)" : finalNetYTD >= 0 ? "var(--qs-success)" : "var(--qs-danger)",
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


export { ResolvedTab, TrendsTab, AttritionTab, NetGrowthTab };
