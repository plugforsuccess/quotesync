// src/pages/components/retention/RetentionAnalytics.jsx
// Extracted from BookHealthPage.jsx — analytics/reporting tabs.

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, LineChart, ReferenceLine, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { useAgencyProductConfig } from '../../../hooks/useAgencyProductConfig';
import { TerminationUploadZone } from './RetentionImport';
import { useChartTheme } from '../../../lib/chartTheme';

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
  // Candidate-priority match: specific names ("termination effective") must
  // beat generic ones ("effective date") regardless of header order.
  const findLapseCol = (candidates) => {
    for (const c of candidates) {
      const i = headers.findIndex(h => h?.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iPolicy   = findLapseCol(["policy number", "policy no", "policy"]);
  const iFirst    = findLapseCol(["insured first name", "first name"]);
  const iLast     = findLapseCol(["insured last name", "last name"]);
  const iCustomer = findLapseCol(["customer name", "insured name", "customer", "insured", "name"]);
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

    // BOB exports split the name into First/Last columns — combine when present
    let customerName = "";
    if (iFirst >= 0 && iLast >= 0) {
      customerName = `${r[iFirst]?.toString().trim() ?? ""} ${r[iLast]?.toString().trim() ?? ""}`.trim();
    }
    if (!customerName && iCustomer >= 0) {
      customerName = r[iCustomer]?.toString().trim() ?? "";
    }

    return {
      policy_no:          iPolicy >= 0   ? r[iPolicy]?.toString().trim() ?? "" : "",
      customer_name:      customerName,
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

// STATUS_CONFIG is built per-component using the active theme — see
// buildStatusConfig() called inside ResolvedTab. The bg values come from
// the theme tokens so dark tooltip colors don't leak into light mode.
function buildStatusConfig(ct) {
  return {
    pending:             { label: "New",             bg: ct.structural.tooltipBg, fg: ct.data.amber   },
    attempting:          { label: "Attempting",      bg: ct.structural.tooltipBg, fg: ct.data.orange  },
    left_voicemail:      { label: "Left VM",         bg: ct.structural.tooltipBg, fg: ct.data.orange  },
    contacted:           { label: "Contacted",       bg: ct.structural.tooltipBg, fg: ct.data.blue    },
    payment_plan_requested: { label: "Pmt Plan Req", bg: ct.structural.tooltipBg, fg: ct.data.purple  },
    promise_to_pay:      { label: "Promise-to-Pay",  bg: ct.structural.tooltipBg, fg: ct.data.purple  },
    promise_broken:      { label: "Promise Broken",  bg: ct.structural.tooltipBg, fg: ct.data.red     },
    saved:               { label: "Saved",           bg: ct.status.saved.bg,      fg: ct.status.saved.fg },
    rewritten:           { label: "Rewritten",       bg: "#065F46",               fg: "#6EE7B7"          },
    lost:                { label: "Lost",            bg: ct.status.lost.bg,       fg: ct.status.lost.fg  },
    auto_resolved:       { label: "Auto-Resolved",   bg: ct.structural.tooltipBg, fg: ct.data.slate   },
    requested_cancellation: { label: "Termination",  bg: ct.structural.tooltipBg, fg: ct.data.slate   },
  };
}

function ResolvedTab({ resolvedEvents }) {
  const ct = useChartTheme();
  const STATUS_CONFIG = buildStatusConfig(ct);
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
  const ct = useChartTheme();
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
            <CartesianGrid strokeDasharray="3 3" stroke={ct.structural.grid} />
            <XAxis dataKey="month" stroke={ct.structural.axisLine} tick={{ fill: ct.structural.axisTick, fontSize: 11 }} />
            <YAxis yAxisId="left" stroke={ct.structural.axisLine} tick={{ fill: ct.structural.axisTick, fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" stroke={ct.structural.axisLine} tick={{ fill: ct.structural.axisTick, fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, fontSize: 12, color: "var(--qs-text)" }}
              labelStyle={{ color: "var(--qs-dim)" }}
              itemStyle={{ color: "var(--qs-text)" }}
            />
            <Bar yAxisId="left" dataKey="cancels" name="Cancels" fill={ct.data.red} radius={[4, 4, 0, 0]} opacity={0.7} />
            <Bar yAxisId="left" dataKey="saves" name="Saves (payment)" stackId="saves" fill={ct.data.green} radius={[0, 0, 0, 0]} />
            <Bar yAxisId="left" dataKey="rewrites" name="Rewrites (rate cut)" stackId="saves" fill="#34D399" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="saveRate" name="Save Rate %" stroke={ct.data.amber} strokeWidth={2} dot={{ fill: ct.data.amber, r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AttritionTab({ agencyId, currentUserId }) {
  const { config: productConfig } = useAgencyProductConfig(agencyId);

  // Monthly summary data — React Query cache survives unmount/remount
  const { data: monthlySummary = [], isLoading: loading } = useQuery({
    queryKey: ["lapse_events_summary", agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lapse_events")
        .select("report_month, product, premium, item_count")
        .eq("agency_id", agencyId)
        .eq("backfill", false) // exclude one-time historical winback backfill
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

      {/* Upload Section — delegated to shared component */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Upload Termination Report</div>
      <TerminationUploadZone agencyId={agencyId} currentUserId={currentUserId} />
    </div>
  );
}

// ─── Global Styles ─────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--qs-elevated); } ::-webkit-scrollbar-thumb { background: var(--qs-muted); border-radius: 3px; } input, select { background: var(--qs-elevated) !important; color: var(--qs-text) !important; border: 1px solid var(--qs-border) !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: var(--qs-info) !important; } .card { background: var(--qs-card); border: 1px solid var(--qs-border); border-radius: 12px; padding: 20px; } .btn-primary { background: var(--qs-info); color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; } .btn-ghost { background: transparent; color: var(--qs-dim); border: 1px solid var(--qs-border); border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: var(--qs-elevated); color: var(--qs-text); border-color: var(--qs-info); } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: var(--qs-subtle); transition: all 0.15s; } .tab.active { background: var(--qs-elevated); color: var(--qs-text); } .upload-zone { border: 2px dashed var(--qs-border); border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: var(--qs-info); } label { font-size: 12px; color: var(--qs-subtle); font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--qs-subtle); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--qs-border); } td { padding: 9px 12px; border-bottom: 1px solid var(--qs-elevated); color: var(--qs-text); } .urgency-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; font-family: 'DM Mono', monospace; } .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; } .triage-row:hover td { background: var(--qs-elevated); cursor: pointer; } .scroll-hint-container { position: relative; } .scroll-hint-container::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 24px; background: linear-gradient(to right, transparent, var(--qs-dark)); pointer-events: none; opacity: 1; transition: opacity 0.2s; } @media (min-width: 840px) { .scroll-hint-container::after { opacity: 0; } }`;

// ─── Net Portfolio Growth Tab ──────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


function NetGrowthTab({ agencyId }) {
  const ct = useChartTheme();
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
          .eq("agency_id", agencyId)
          .eq("backfill", false), // exclude one-time historical winback backfill
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
            tick={{ fill: ct.structural.axisTick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis tick={{ fill: ct.structural.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip
            labelFormatter={fmtMonth}
            contentStyle={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 8, fontSize: 12, color: "var(--qs-text)" }}
            labelStyle={{ color: "var(--qs-dim)" }}
            itemStyle={{ color: "var(--qs-text)" }}
            formatter={(value, name) => [value, name === "nb_points" ? "Points Gained" : name === "lapse_points" ? "Points Lost" : "Net"]}
          />
          <ReferenceLine y={0} stroke={ct.structural.referenceLine} />
          <Bar dataKey="nb_points" name="nb_points" fill={ct.data.green} radius={[3,3,0,0]} maxBarSize={28} />
          <Bar dataKey="lapse_points" name="lapse_points" fill={ct.data.red} radius={[3,3,0,0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>

      {/* Net Points Line Chart */}
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" hide />
            <YAxis tick={{ fill: ct.structural.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <ReferenceLine y={0} stroke={ct.structural.referenceLine} strokeDasharray="4 4" />
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
              stroke={ct.data.blue}
              strokeWidth={2}
              dot={({ cx, cy, payload }) => (
                <circle key={payload.month} cx={cx} cy={cy} r={4}
                  fill={payload.net_points >= 0 ? ct.data.green : ct.data.red}
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
