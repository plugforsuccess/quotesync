import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { useRevenueEntries } from "../../../hooks/useRevenueEntries";
import * as XLSX from "xlsx";

// ─── Commission Matrix ────────────────────────────────────────────────────────
// Three-tier rates: Preferred / Bundled / Monoline (new business only)
const COMMISSION = {
  auto:    { preferred: 0.25, bundled: 0.20, monoline: 0.15, label: "Auto" },
  ho:      { preferred: 0.29, bundled: 0.25, monoline: 0.16, label: "HO / Condo" },
  renters: { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Renters" },
  other:   { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Other Personal Lines" },
};
const TIER_LABELS = { preferred: "Preferred", bundled: "Bundled", monoline: "Monoline" };
const TIER_COLORS = { preferred: "#10B981", bundled: "#3B82F6", monoline: "#64748B" };

const COMMISSION_GOAL = 40000;  // primary goal — commission revenue
const PREMIUM_GOAL    = 160000; // secondary goal — written premium volume
const PRODUCT_COLORS = { auto: "#3B82F6", ho: "#10B981", renters: "#F59E0B", other: "#8B5CF6" };

const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
const fmtFull$ = (n) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

function calcCommission(premium, product, tier = "monoline") {
  const rates = COMMISSION[product] ?? COMMISSION.other;
  return premium * (rates[tier] ?? rates.monoline);
}

function normalizeTier(raw = "") {
  const v = raw.toString().toLowerCase().trim();
  if (v.startsWith("p")) return "preferred";
  if (v.startsWith("b")) return "bundled";
  return "monoline";
}

const TODAY = new Date();
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function todayDayOfMonth() { return TODAY.getDate(); }

// ─── Empty entry template ─────────────────────────────────────────────────────
const emptyEntry = () => ({
  id: crypto.randomUUID(),
  date: TODAY.toISOString().slice(0, 10),
  product: "auto",
  tier: "monoline",
  premium: "",
  policyCount: 1,
  source: "manual",
  note: "",
});

// ─── Parse uploaded Allstate CSV/XLSX rows ───────────────────────────────────
function parseAllstateRows(rows) {
  // Best-effort mapping for common Allstate export column names
  const COL_MAP = {
    date:    ["effective date", "policy date", "date", "eff date"],
    premium: ["written premium", "premium", "annual premium", "prem"],
    product: ["line of business", "lob", "product", "type"],
    policy:  ["policy number", "policy #", "policy no"],
    tier:    ["bundle tier", "tier", "bundle"],
  };
  const findCol = (headers, keys) => {
    const h = headers.map((x) => x?.toString().toLowerCase().trim());
    for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
    return -1;
  };

  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  const di      = findCol(headers, COL_MAP.date);
  const pi      = findCol(headers, COL_MAP.premium);
  const li      = findCol(headers, COL_MAP.product);
  const iTier   = findCol(headers, COL_MAP.tier);   // -1 if column absent
  const iPolicyNo = findCol(headers, COL_MAP.policy); // -1 if column absent

  return rows.slice(1).filter(r => r.some(Boolean)).map((r) => {
    const raw = r[li]?.toString().toLowerCase() ?? "";
    let product = "other";
    if (raw.includes("auto") || raw.includes("private passenger")) product = "auto";
    else if (raw.includes("home") || raw.includes("condo") || raw.includes("ho3") || raw.includes("ho6")) product = "ho";
    else if (raw.includes("rent") || raw.includes("ho4")) product = "renters";

    const rawDate = di >= 0 ? r[di] : null;
    let date = TODAY.toISOString().slice(0, 10);
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d)) date = d.toISOString().slice(0, 10);
    }

    return {
      id: crypto.randomUUID(),
      date,
      product,
      tier:     normalizeTier(iTier >= 0 ? r[iTier] : ""),
      premium:  parseFloat(r[pi]?.toString().replace(/[$,]/g, "")) || 0,
      policyCount: 1,
      policyNo: iPolicyNo >= 0 ? (r[iPolicyNo]?.toString().trim() || null) : null,
      source:   "upload",
      note:     r[li]?.toString() ?? "",
    };
  }).filter(e => e.premium > 0);
}

// ─── Drill-Down Modal ─────────────────────────────────────────────────────────
function DrillDownModal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: 14, width: "100%", maxWidth: 900, maxHeight: "85vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RevenueProjectionsDashboard() {
  const [newEntry, setNewEntry] = useState(emptyEntry());
  const [view, setView] = useState("month"); // month | ytd
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview | entries | upload
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [modal, setModal] = useState(null); // null | "commission" | "premium" | "trend" | "products" | "kpi-*"
  const closeModal = () => setModal(null);
  const fileRef = useRef();

  // ─── Date range for current view ──────────────────────────────────────────
  const { rangeStart, rangeEnd, label: rangeLabel } = useMemo(() => {
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    if (view === "month") {
      return {
        rangeStart: new Date(y, m, 1),
        rangeEnd: new Date(y, m + 1, 0),
        label: `${MONTH_NAMES[m]} ${y}`,
      };
    }
    if (view === "ytd") {
      return {
        rangeStart: new Date(y, 0, 1),
        rangeEnd: TODAY,
        label: `YTD ${y}`,
      };
    }
    // fallback (should not reach)
    return { rangeStart: new Date(y, m, 1), rangeEnd: new Date(y, m + 1, 0), label: `${MONTH_NAMES[m]} ${y}` };
  }, [view]);

  const { entries, loading, error, addEntry, addEntries, deleteEntry } = useRevenueEntries({ rangeStart, rangeEnd });

  // ─── Filtered entries ──────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    entries.filter(e => {
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    }), [entries, rangeStart, rangeEnd]);

  // ─── Aggregated totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const base = { premium: 0, commission: 0, count: 0 };
    const byProduct = { auto: {...base}, ho: {...base}, renters: {...base}, other: {...base} };
    filtered.forEach(e => {
      const c = calcCommission(e.premium, e.product, e.tier ?? "monoline");
      const p = byProduct[e.product] ?? byProduct.other;
      p.premium += e.premium;
      p.commission += c;
      p.count += e.policyCount;
    });
    const totalPremium = Object.values(byProduct).reduce((s, v) => s + v.premium, 0);
    const totalCommission = Object.values(byProduct).reduce((s, v) => s + v.commission, 0);
    return { byProduct, totalPremium, totalCommission };
  }, [filtered]);

  // ─── Monthly trend (rolling 12 or YTD) ────────────────────────────────────
  const trendData = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return months.map(({ year, month }) => {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const slice = entries.filter(e => { const d = new Date(e.date); return d >= start && d <= end; });
      const premium = slice.reduce((s, e) => s + e.premium, 0);
      const commission = slice.reduce((s, e) => s + calcCommission(e.premium, e.product, e.tier ?? "monoline"), 0);
      return { name: `${MONTH_NAMES[month]} '${String(year).slice(2)}`, premium, commission, goal: COMMISSION_GOAL };
    });
  }, [entries]);

  // ─── Pace calculation (month view only) ───────────────────────────────────
  const pace = useMemo(() => {
    if (view !== "month") return null;
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    const totalDays = daysInMonth(y, m);
    const elapsed = todayDayOfMonth();
    const projectedCommission = elapsed > 0 ? (totals.totalCommission / elapsed) * totalDays : 0;
    const projectedPremium    = elapsed > 0 ? (totals.totalPremium    / elapsed) * totalDays : 0;
    return { projectedCommission, projectedPremium, elapsed, totalDays, onPace: projectedCommission >= COMMISSION_GOAL };
  }, [view, totals.totalCommission, totals.totalPremium]);

  // ─── Goal pcts ────────────────────────────────────────────────────────────
  const commissionGoalPct = Math.min(totals.totalCommission / COMMISSION_GOAL, 1);

  // ─── Daily target (month view only) ───────────────────────────────────────
  const dailyTarget = useMemo(() => {
    if (view !== "month") return null;
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    const totalDays = daysInMonth(y, m);
    const elapsed = todayDayOfMonth();
    const remaining = totalDays - elapsed;
    if (remaining <= 0) return null;

    const commissionRemaining = Math.max(COMMISSION_GOAL - totals.totalCommission, 0);
    const premiumRemaining    = Math.max(PREMIUM_GOAL    - totals.totalPremium,    0);

    const totalPolicies = filtered.reduce((s, e) => s + e.policyCount, 0);
    const avgCommissionPerPolicy = totalPolicies > 0 ? totals.totalCommission / totalPolicies : null;
    const avgPremiumPerPolicy    = totalPolicies > 0 ? totals.totalPremium    / totalPolicies : null;

    const dailyCommissionNeeded = commissionRemaining / remaining;
    const dailyPremiumNeeded    = premiumRemaining    / remaining;
    const policiesPerDayNeeded  = avgCommissionPerPolicy ? dailyCommissionNeeded / avgCommissionPerPolicy : null;

    return {
      commissionRemaining, premiumRemaining, remaining,
      dailyCommissionNeeded, dailyPremiumNeeded, policiesPerDayNeeded,
      avgCommissionPerPolicy, avgPremiumPerPolicy, totalPolicies,
    };
  }, [view, totals, filtered]);

  // ─── Add manual entry ─────────────────────────────────────────────────────
  const handleAddEntry = async () => {
    const premium = parseFloat(newEntry.premium);
    if (!premium || premium <= 0) return;
    const { error } = await addEntry({ ...newEntry, premium });
    if (!error) setNewEntry(emptyEntry());
  };

  // ─── File upload ───────────────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() !== "filters") ?? wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
      const parsed = parseAllstateRows(rows);
      if (parsed.length === 0) {
        setUploadMsg("⚠️ No rows parsed — check column headers match Allstate export format.");
      } else {
        const { count, error } = await addEntries(parsed);
        if (error) {
          setUploadMsg(`❌ Error saving to database: ${error}`);
        } else {
          setUploadMsg(`✅ ${count} policies synced from ${file.name} — duplicates updated in place.`);
        }
      }
    } catch (err) {
      setUploadMsg(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ─── PDF Export ───────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setPdfGenerating(true);
    try {
      const [{ pdf }, { default: RevenueReportPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./RevenueReportPDF"),
      ]);
      const blob = await pdf(
        <RevenueReportPDF
          entries={filtered}
          totals={totals}
          rangeLabel={rangeLabel}
          view={view}
          goalPct={commissionGoalPct}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue-${view}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  };

  // ─── CSV Export ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["Date", "Product", "Bundle Tier", "Annual Premium", "Commission", "Policy Count", "Source", "Note"];
    const rows = filtered.map(e => [
      e.date,
      COMMISSION[e.product]?.label ?? e.product,
      TIER_LABELS[e.tier ?? "monoline"],
      e.premium.toFixed(2),
      calcCommission(e.premium, e.product, e.tier ?? "monoline").toFixed(2),
      e.policyCount,
      e.source,
      e.note,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Product bar chart data ───────────────────────────────────────────────
  const productData = Object.entries(totals.byProduct).map(([key, val]) => ({
    name: COMMISSION[key].label,
    premium: Math.round(val.premium),
    commission: Math.round(val.commission),
    key,
  })).filter(d => d.premium > 0);

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1A1D27; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; } input, select { background: #1E2130 !important; color: #E2E8F0 !important; border: 1px solid #2D3348 !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: #3B82F6 !important; } .card { background: #161924; border: 1px solid #252A3A; border-radius: 12px; padding: 20px; } .btn-primary { background: #3B82F6; color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-ghost { background: transparent; color: #94A3B8; border: 1px solid #2D3348; border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: #1E2130; color: #E2E8F0; border-color: #3B82F6; } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: #64748B; transition: all 0.15s; } .tab.active { background: #1E2130; color: #E2E8F0; } .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace; } .del-btn { background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; } .del-btn:hover { background: #2D1A1A; } .upload-zone { border: 2px dashed #2D3348; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: #3B82F6; } label { font-size: 12px; color: #64748B; font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 13px; } th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252A3A; } td { padding: 9px 12px; border-bottom: 1px solid #1A1D27; } tr:hover td { background: #161924; } .clickable { cursor: pointer; transition: border-color 0.15s; } .clickable:hover { border-color: #3B82F6; }`}</style>

      {error && (
        <div style={{ background: "#2D1A1A", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ color: "#475569", fontSize: 13, marginBottom: 12 }}>Loading entries...</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3B82F6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>insuredbycam.com</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#F1F5F9" }}>Revenue Projections</h1>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>New Business · Commission Goal: {fmtFull$(COMMISSION_GOAL)}/mo</div>
        </div>
        {/* View selector */}
        <div style={{ display: "flex", gap: 6 }}>
          {[["month","This Month"],["ytd","YTD"]].map(([v,l]) => (
            <button key={v} className={`btn-ghost ${view===v?"active":""}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {/* Written Premium */}
        <div className="card clickable" onClick={() => setModal("kpi-written")}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Written Premium</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalPremium)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{rangeLabel}</div>
        </div>
        {/* Commission Earned */}
        <div className="card clickable" onClick={() => setModal("kpi-commission")}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Commission Earned</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalCommission)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"}</div>
        </div>
        {/* Policies */}
        <div className="card clickable" onClick={() => setModal("kpi-policies")}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Policies Written</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>{filtered.reduce((s,e) => s + e.policyCount, 0)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Avg premium: {filtered.length > 0 ? fmt$(totals.totalPremium / filtered.reduce((s,e) => s + e.policyCount,0)) : "—"}</div>
        </div>
        {/* Commission Goal */}
        <div className="card clickable" style={{ position: "relative", overflow: "hidden" }} onClick={() => setModal("kpi-goal")}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Commission Goal</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: commissionGoalPct >= 1 ? "#10B981" : "#F59E0B", fontFamily: "'DM Mono', monospace" }}>{Math.round(commissionGoalPct * 100)}%</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{fmt$(COMMISSION_GOAL - totals.totalCommission > 0 ? COMMISSION_GOAL - totals.totalCommission : 0)} remaining</div>
          {/* mini progress bar */}
          <div style={{ height: 3, background: "#252A3A", borderRadius: 2, marginTop: 10 }}>
            <div style={{ height: "100%", width: `${Math.min(commissionGoalPct * 100, 100)}%`, background: commissionGoalPct >= 1 ? "#10B981" : "#3B82F6", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>
        {/* Pace (month only) */}
        {pace && (
          <div className="card clickable" onClick={() => setModal("kpi-pace")}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Month-End Pace</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: pace.onPace ? "#10B981" : "#EF4444", fontFamily: "'DM Mono', monospace" }}>{fmt$(pace.projectedCommission)}</div>
            <div style={{ fontSize: 11, color: pace.onPace ? "#10B981" : "#EF4444", marginTop: 2 }}>{pace.onPace ? "✓ On pace" : "↓ Behind pace"} · Day {pace.elapsed}/{pace.totalDays}</div>
          </div>
        )}
        {dailyTarget && (
          <div className="card clickable" onClick={() => setModal("kpi-daily")}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Daily Target</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#F59E0B", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(dailyTarget.dailyCommissionNeeded)}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>commission / day · {dailyTarget.remaining} days left</div>
            <div style={{ borderTop: "1px solid #252A3A", margin: "10px 0" }} />
            {dailyTarget.policiesPerDayNeeded !== null ? (
              <div style={{ fontSize: 12, color: "#94A3B8" }}>
                <span style={{ color: "#F59E0B", fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{dailyTarget.policiesPerDayNeeded.toFixed(1)}</span>
                {" "}policies/day
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "#334155" }}>Add entries to calculate policies/day</div>
            )}
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
              <span style={{ color: "#64748B", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(dailyTarget.dailyPremiumNeeded)}</span>
              {" "}premium/day
            </div>
            {dailyTarget.avgCommissionPerPolicy && (
              <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>
                Avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy
              </div>
            )}
          </div>
        )}
      </div>

      {/* Goal Tracking */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        {/* Commission Goal — primary */}
        <div style={{ marginBottom: 16, cursor: "pointer" }} onClick={() => setModal("commission")}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "#94A3B8", fontWeight: 600 }}>Commission Revenue Goal</span>
            <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>
              {fmtFull$(totals.totalCommission)} / {fmtFull$(COMMISSION_GOAL)}
            </span>
          </div>
          <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(totals.totalCommission / COMMISSION_GOAL * 100, 100)}%`,
              background: totals.totalCommission >= COMMISSION_GOAL ? "#10B981" : "linear-gradient(90deg, #10B981, #3B82F6)",
              borderRadius: 5,
              transition: "width 0.5s",
            }} />
          </div>
        </div>
        {/* Written Premium Volume — secondary */}
        <div style={{ cursor: "pointer" }} onClick={() => setModal("premium")}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "#94A3B8", fontWeight: 600 }}>Written Premium Volume</span>
            <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>
              {fmtFull$(totals.totalPremium)} / {fmtFull$(PREMIUM_GOAL)}
            </span>
          </div>
          <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`,
              background: "linear-gradient(90deg, #3B82F6, #8B5CF6)",
              borderRadius: 5,
              transition: "width 0.5s",
            }} />
          </div>
          {/* Product breakdown dots */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", color: "#94A3B8" }}>
            {Object.entries(totals.byProduct).map(([key, val]) => val.premium > 0 && (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRODUCT_COLORS[key] }} />
                <span style={{ color: "#64748B" }}>{COMMISSION[key].label}</span>
                <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>{fmt$(val.premium)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[["overview","Overview"],["entries","Entries"],["upload","Upload"]].map(([t,l]) => (
          <button key={t} className={`tab ${activeTab===t?"active":""}`} onClick={() => setActiveTab(t)}>{l}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Monthly Trend */}
          <div className="card clickable" style={{ gridColumn: "1 / -1" }} onClick={() => setModal("trend")}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Monthly Commission Earned vs $40K Goal</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: "$40K", fill: "#10B981", fontSize: 11 }} />
                <Bar dataKey="commission" fill="#10B981" radius={[4,4,0,0]}>
                  {trendData.map((entry, i) => (
                    <Cell key={i} fill={entry.commission >= COMMISSION_GOAL ? "#10B981" : "#3B82F6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By Product Premium */}
          <div className="card clickable" onClick={() => setModal("products")}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Premium by Product Line</div>
            {productData.length === 0 ? (
              <div style={{ color: "#334155", textAlign: "center", padding: "30px 0", fontSize: 13 }}>No data in range</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={productData} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtFull$(v), "Premium"]} />
                  <Bar dataKey="premium" radius={[0,4,4,0]}>
                    {productData.map((d, i) => <Cell key={i} fill={PRODUCT_COLORS[d.key]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Commission by Product */}
          <div className="card clickable" onClick={() => setModal("products")}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Estimated Commission by Product</div>
            {productData.length === 0 ? (
              <div style={{ color: "#334155", textAlign: "center", padding: "30px 0", fontSize: 13 }}>No data in range</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                {Object.entries(totals.byProduct).filter(([,v]) => v.premium > 0).map(([key, val]) => (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: "#94A3B8" }}>{COMMISSION[key].label}</span>
                      <span style={{ color: PRODUCT_COLORS[key], fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{fmtFull$(val.commission)}</span>
                    </div>
                    <div style={{ height: 5, background: "#252A3A", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${Math.min(val.premium / totals.totalPremium * 100, 100)}%`, background: PRODUCT_COLORS[key], borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>
                      {fmtFull$(val.premium)} premium · eff. rate: {val.premium > 0 ? fmtPct(val.commission / val.premium) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ENTRIES TAB ── */}
      {activeTab === "entries" && (
        <div className="card">
          {/* Add Manual Entry */}
          <div style={{ marginBottom: 20, padding: 16, background: "#1A1D27", borderRadius: 10, border: "1px solid #252A3A" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8" }}>Add Manual Entry</div>
              {filtered.length > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-ghost" onClick={exportCSV}>Export CSV</button>
                  <button className="btn-ghost" onClick={exportPDF} disabled={pdfGenerating}>
                    {pdfGenerating ? "Generating…" : "Export PDF"}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label>Date</label>
                <input type="date" value={newEntry.date} onChange={e => setNewEntry(p => ({...p, date: e.target.value}))} style={{ width: 140 }} />
              </div>
              <div>
                <label>Product</label>
                <select value={newEntry.product} onChange={e => setNewEntry(p => ({...p, product: e.target.value}))}>
                  <option value="auto">Auto</option>
                  <option value="ho">HO / Condo</option>
                  <option value="renters">Renters</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label>Bundle Tier</label>
                <select value={newEntry.tier} onChange={e => setNewEntry(p => ({...p, tier: e.target.value}))}>
                  <option value="preferred">Preferred</option>
                  <option value="bundled">Bundled</option>
                  <option value="monoline">Monoline</option>
                </select>
              </div>
              <div>
                <label>Annual Premium ($)</label>
                <input type="number" placeholder="1200" value={newEntry.premium} onChange={e => setNewEntry(p => ({...p, premium: e.target.value}))} style={{ width: 120 }} />
              </div>
              <div>
                <label>Policies</label>
                <input type="number" value={newEntry.policyCount} min={1} onChange={e => setNewEntry(p => ({...p, policyCount: parseInt(e.target.value)||1}))} style={{ width: 70 }} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label>Note (optional)</label>
                <input type="text" placeholder="Household name, bundle..." value={newEntry.note} onChange={e => setNewEntry(p => ({...p, note: e.target.value}))} style={{ width: "100%" }} />
              </div>
              <button className="btn-primary" onClick={handleAddEntry}>Add</button>
            </div>
          </div>

          {/* Commission rate reminder — all three tiers */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {Object.entries(COMMISSION).map(([key, val]) => (
              <div key={key} style={{ background: "#1A1D27", border: `1px solid ${PRODUCT_COLORS[key]}33`, borderRadius: 6, padding: "6px 12px", fontSize: 11 }}>
                <span style={{ color: PRODUCT_COLORS[key], fontWeight: 600, marginRight: 6 }}>{val.label}</span>
                {Object.entries(TIER_LABELS).map(([tk, tl]) => (
                  <span key={tk} style={{ color: TIER_COLORS[tk], marginRight: 5 }}>{tl}: {fmtPct(val[tk])}</span>
                ))}
              </div>
            ))}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#334155", fontSize: 13 }}>No entries in this range. Add manually or upload an Allstate report.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>Tier</th><th>Premium</th><th>Commission</th><th>Source</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const tier = e.tier ?? "monoline";
                  return (
                    <tr key={e.id}>
                      <td style={{ color: "#64748B", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.date}</td>
                      <td><span className="tag" style={{ background: `${PRODUCT_COLORS[e.product]}22`, color: PRODUCT_COLORS[e.product] }}>{COMMISSION[e.product]?.label}</span></td>
                      <td><span className="tag" style={{ background: `${TIER_COLORS[tier]}22`, color: TIER_COLORS[tier] }}>{TIER_LABELS[tier]}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(e.premium)}</td>
                      <td style={{ color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(calcCommission(e.premium, e.product, tier))}</td>
                      <td><span className="tag" style={{ background: e.source==="upload" ? "#1E3A5F" : "#1E3348", color: e.source==="upload" ? "#60A5FA" : "#94A3B8" }}>{e.source}</span></td>
                      <td style={{ color: "#475569", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</td>
                      <td><button className="del-btn" onClick={() => deleteEntry(e.id)}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ color: "#64748B", fontWeight: 600, paddingTop: 12 }}>Total</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#F1F5F9", paddingTop: 12 }}>{fmtFull$(totals.totalPremium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#10B981", paddingTop: 12 }}>{fmtFull$(totals.totalCommission)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {activeTab === "upload" && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Upload Allstate Export</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
            Accepts XLSX or CSV. Expects columns: <span style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>Effective Date, Written Premium, Line of Business, Bundle Tier</span> (or similar Allstate report headers). <span style={{ color: "#64748B" }}>Bundle Tier column is optional — rows without it default to Monoline.</span>
          </div>
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
            <div style={{ fontSize: 32, marginBottom: 10 }}>📤</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>{uploading ? "Processing…" : "Click to upload or drag & drop"}</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>XLSX, XLS, or CSV</div>
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 14, padding: "10px 16px", background: "#1A1D27", borderRadius: 8, fontSize: 13, color: "#94A3B8" }}>{uploadMsg}</div>
          )}
          <div style={{ marginTop: 24, padding: 16, background: "#1A1D27", borderRadius: 10, border: "1px solid #252A3A" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Commission Reference — New Business Rates by Tier</div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ color: TIER_COLORS.preferred }}>Preferred</th>
                  <th style={{ color: TIER_COLORS.bundled }}>Bundled</th>
                  <th style={{ color: TIER_COLORS.monoline }}>Monoline</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(COMMISSION).map(([key, val]) => (
                  <tr key={key}>
                    <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{val.label}</span></td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: TIER_COLORS.preferred }}>{fmtPct(val.preferred)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: TIER_COLORS.bundled }}>{fmtPct(val.bundled)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: TIER_COLORS.monoline }}>{fmtPct(val.monoline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

      {/* ── MODALS ── */}

      {/* Commission goal drill-down */}
      {modal === "commission" && (
        <DrillDownModal title="Commission Revenue Goal" onClose={closeModal}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#94A3B8" }}>Commission Revenue Goal</span>
              <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(totals.totalCommission)} / {fmtFull$(COMMISSION_GOAL)}</span>
            </div>
            <div style={{ height: 14, background: "#252A3A", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(totals.totalCommission / COMMISSION_GOAL * 100, 100)}%`, background: totals.totalCommission >= COMMISSION_GOAL ? "#10B981" : "linear-gradient(90deg, #10B981, #3B82F6)", borderRadius: 7, transition: "width 0.5s" }} />
            </div>
          </div>
          <table>
            <thead><tr><th>Month</th><th>Commission</th><th>vs $40K Goal</th></tr></thead>
            <tbody>
              {trendData.map(d => (
                <tr key={d.name}>
                  <td style={{ color: "#94A3B8" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#F1F5F9" }}>{fmtFull$(d.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#EF4444" }}>{d.commission > 0 ? fmtPct(d.commission / COMMISSION_GOAL) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* Premium volume drill-down */}
      {modal === "premium" && (
        <DrillDownModal title="Written Premium Volume" onClose={closeModal}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#94A3B8" }}>Written Premium Volume</span>
              <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(totals.totalPremium)} / {fmtFull$(PREMIUM_GOAL)}</span>
            </div>
            <div style={{ height: 14, background: "#252A3A", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`, background: "linear-gradient(90deg, #3B82F6, #8B5CF6)", borderRadius: 7, transition: "width 0.5s" }} />
            </div>
          </div>
          <table>
            <thead><tr><th>Month</th><th>Premium</th><th>vs $160K Target</th></tr></thead>
            <tbody>
              {trendData.map(d => (
                <tr key={d.name}>
                  <td style={{ color: "#94A3B8" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#F1F5F9" }}>{fmtFull$(d.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.premium >= PREMIUM_GOAL ? "#10B981" : "#64748B" }}>{d.premium > 0 ? fmtPct(d.premium / PREMIUM_GOAL) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Written Premium */}
      {modal === "kpi-written" && (
        <DrillDownModal title="Written Premium" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(totals.totalPremium)}</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>Total written premium · {rangeLabel}</div>
          <table>
            <thead><tr><th>Month</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {trendData.slice(-6).map(d => (
                <tr key={d.name}>
                  <td style={{ color: "#94A3B8" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(d.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(d.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Commission Earned */}
      {modal === "kpi-commission" && (
        <DrillDownModal title="Commission Earned" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#10B981", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(totals.totalCommission)}</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"} · {rangeLabel}</div>
          <table>
            <thead><tr><th>Product</th><th>Premium</th><th>Commission</th><th>Eff. Rate</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.premium > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(val.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{fmtPct(val.commission / val.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Policies */}
      {modal === "kpi-policies" && (
        <DrillDownModal title="Policies Written" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{filtered.reduce((s,e) => s + e.policyCount, 0)}</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>Total policies · {rangeLabel} · Avg premium: {filtered.length > 0 ? fmtFull$(totals.totalPremium / filtered.reduce((s,e) => s + e.policyCount, 0)) : "—"}</div>
          <table>
            <thead><tr><th>Product</th><th>Policies</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.count > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{val.count}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(val.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Commission Goal */}
      {modal === "kpi-goal" && (
        <DrillDownModal title="Commission Goal" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: commissionGoalPct >= 1 ? "#10B981" : "#F59E0B", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{Math.round(commissionGoalPct * 100)}%</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>{fmtFull$(totals.totalCommission)} earned of {fmtFull$(COMMISSION_GOAL)} goal · {rangeLabel}</div>
          <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ height: "100%", width: `${Math.min(commissionGoalPct * 100, 100)}%`, background: commissionGoalPct >= 1 ? "#10B981" : "linear-gradient(90deg, #10B981, #3B82F6)", borderRadius: 5 }} />
          </div>
          <table>
            <thead><tr><th>Month</th><th>Commission</th><th>Goal %</th></tr></thead>
            <tbody>
              {trendData.slice(-6).map(d => (
                <tr key={d.name}>
                  <td style={{ color: "#94A3B8" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#F1F5F9" }}>{fmtFull$(d.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#EF4444" }}>{d.commission > 0 ? fmtPct(d.commission / COMMISSION_GOAL) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Pace */}
      {modal === "kpi-pace" && pace && (
        <DrillDownModal title="Month-End Pace" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: pace.onPace ? "#10B981" : "#EF4444", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(pace.projectedCommission)}</div>
          <div style={{ fontSize: 13, color: pace.onPace ? "#10B981" : "#EF4444", marginBottom: 24 }}>{pace.onPace ? "✓ On pace" : "↓ Behind pace"} · Day {pace.elapsed} of {pace.totalDays}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[["Commission Earned", fmtFull$(totals.totalCommission), "#10B981"], ["Projected Commission", fmtFull$(pace.projectedCommission), pace.onPace ? "#10B981" : "#EF4444"], ["Premium Written", fmtFull$(totals.totalPremium), "#F1F5F9"], ["Projected Premium", fmtFull$(pace.projectedPremium), "#F1F5F9"]].map(([label, value, color]) => (
              <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{value}</div>
              </div>
            ))}
          </div>
        </DrillDownModal>
      )}

      {/* KPI — Daily Target */}
      {modal === "kpi-daily" && dailyTarget && (
        <DrillDownModal title="Daily Target" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#F59E0B", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(dailyTarget.dailyCommissionNeeded)}</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 24 }}>commission needed per day · {dailyTarget.remaining} days remaining</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              ["Commission Remaining", fmtFull$(dailyTarget.commissionRemaining), "#F59E0B"],
              ["Premium Remaining", fmtFull$(dailyTarget.premiumRemaining), "#64748B"],
              ["Daily Premium Needed", fmtFull$(dailyTarget.dailyPremiumNeeded), "#64748B"],
              ["Policies / Day", dailyTarget.policiesPerDayNeeded ? dailyTarget.policiesPerDayNeeded.toFixed(1) : "—", "#F59E0B"],
            ].map(([label, value, color]) => (
              <div key={label} style={{ background: "#1A1D27", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color }}>{value}</div>
              </div>
            ))}
          </div>
          {dailyTarget.avgCommissionPerPolicy && (
            <div style={{ fontSize: 12, color: "#475569" }}>Based on {dailyTarget.totalPolicies} policies · avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy</div>
          )}
        </DrillDownModal>
      )}

      {/* Trend chart drill-down */}
      {modal === "trend" && (
        <DrillDownModal title="Monthly Commission Earned vs $40K Goal" onClose={closeModal}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={trendData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtFull$(v), "Commission"]} />
              <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: "$40K", fill: "#10B981", fontSize: 11 }} />
              <Bar dataKey="commission" radius={[4,4,0,0]}>
                {trendData.map((entry, i) => (
                  <Cell key={i} fill={entry.commission >= COMMISSION_GOAL ? "#10B981" : "#3B82F6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </DrillDownModal>
      )}

      {/* Product breakdown drill-down */}
      {modal === "products" && (
        <DrillDownModal title="Revenue by Product Line" onClose={closeModal}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Premium by Product</div>
              {productData.length === 0 ? <div style={{ color: "#334155", fontSize: 13 }}>No data</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productData} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtFull$(v), "Premium"]} />
                    <Bar dataKey="premium" radius={[0,4,4,0]}>{productData.map((d, i) => <Cell key={i} fill={PRODUCT_COLORS[d.key]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Commission by Product</div>
              {productData.length === 0 ? <div style={{ color: "#334155", fontSize: 13 }}>No data</div> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productData} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                    <Bar dataKey="commission" radius={[0,4,4,0]}>{productData.map((d, i) => <Cell key={i} fill={PRODUCT_COLORS[d.key]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <table style={{ marginTop: 24 }}>
            <thead><tr><th>Product</th><th>Premium</th><th>Commission</th><th>Eff. Rate</th><th>Policies</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.premium > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(val.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{fmtPct(val.commission / val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{val.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

    </div>
  );
}
