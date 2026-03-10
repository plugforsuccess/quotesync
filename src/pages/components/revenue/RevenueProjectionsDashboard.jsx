import { useState, useMemo, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

// ─── Commission Matrix ────────────────────────────────────────────────────────
// Rates = 9% base + variable compensation (new business only)
const BASE = 0.09;
const COMMISSION = {
  auto:    { rate: BASE + 0.16, label: "Auto" },
  ho:      { rate: BASE + 0.20, label: "HO / Condo" },
  renters: { rate: BASE + 0.17, label: "Renters" },
  other:   { rate: BASE + 0.17, label: "Other Personal Lines" },
};

const GOAL = 40000;
const PRODUCT_COLORS = { auto: "#3B82F6", ho: "#10B981", renters: "#F59E0B", other: "#8B5CF6" };

const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
const fmtFull$ = (n) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

function calcCommission(premium, product) {
  return premium * (COMMISSION[product]?.rate ?? BASE);
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
  premium: "",
  policyCount: 1,
  source: "manual",
  note: "",
});

// ─── Parse uploaded Allstate CSV/XLSX rows ───────────────────────────────────
function parseAllstateRows(rows) {
  // Best-effort mapping for common Allstate export column names
  const COL_MAP = {
    date: ["effective date", "policy date", "date", "eff date"],
    premium: ["written premium", "premium", "annual premium", "prem"],
    product: ["line of business", "lob", "product", "type"],
    policy: ["policy number", "policy #", "policy no"],
  };
  const findCol = (headers, keys) => {
    const h = headers.map((x) => x?.toString().toLowerCase().trim());
    for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
    return -1;
  };

  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  const di = findCol(headers, COL_MAP.date);
  const pi = findCol(headers, COL_MAP.premium);
  const li = findCol(headers, COL_MAP.product);

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
      premium: parseFloat(r[pi]?.toString().replace(/[$,]/g, "")) || 0,
      year: 1,  // always new business
      policyCount: 1,
      source: "upload",
      note: r[li]?.toString() ?? "",
    };
  }).filter(e => e.premium > 0);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RevenueProjectionsDashboard() {
  const [entries, setEntries] = useState([]);
  const [newEntry, setNewEntry] = useState(emptyEntry());
  const [view, setView] = useState("month"); // month | ytd
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview | entries | upload
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
      const c = calcCommission(e.premium, e.product);
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
      const commission = slice.reduce((s, e) => s + calcCommission(e.premium, e.product), 0);
      return { name: `${MONTH_NAMES[month]} '${String(year).slice(2)}`, premium, commission, goal: GOAL };
    });
  }, [entries]);

  // ─── Pace calculation (month view only) ───────────────────────────────────
  const pace = useMemo(() => {
    if (view !== "month") return null;
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    const totalDays = daysInMonth(y, m);
    const elapsed = todayDayOfMonth();
    const projected = elapsed > 0 ? (totals.totalPremium / elapsed) * totalDays : 0;
    const pct = Math.min(projected / GOAL, 2);
    return { projected, pct, elapsed, totalDays, onPace: projected >= GOAL };
  }, [view, totals.totalPremium]);

  // ─── Goal pct ─────────────────────────────────────────────────────────────
  const goalPct = Math.min(totals.totalPremium / GOAL, 1);

  // ─── Add manual entry ─────────────────────────────────────────────────────
  const addEntry = () => {
    const premium = parseFloat(newEntry.premium);
    if (!premium || premium <= 0) return;
    setEntries(prev => [...prev, { ...newEntry, id: crypto.randomUUID(), premium }]);
    setNewEntry(emptyEntry());
  };

  // ─── File upload ───────────────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const { read, utils } = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
      const buf = await file.arrayBuffer();
      const wb = read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() !== "filters") ?? wb.SheetNames[0];
      const rows = utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
      const parsed = parseAllstateRows(rows);
      if (parsed.length === 0) {
        setUploadMsg("⚠️ No rows parsed — check column headers match Allstate export format.");
      } else {
        setEntries(prev => [...prev, ...parsed]);
        setUploadMsg(`✅ Imported ${parsed.length} policies from ${file.name}`);
      }
    } catch (err) {
      setUploadMsg(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deleteEntry = (id) => setEntries(prev => prev.filter(e => e.id !== id));

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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1A1D27; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; } input, select { background: #1E2130 !important; color: #E2E8F0 !important; border: 1px solid #2D3348 !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: #3B82F6 !important; } .card { background: #161924; border: 1px solid #252A3A; border-radius: 12px; padding: 20px; } .btn-primary { background: #3B82F6; color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-ghost { background: transparent; color: #94A3B8; border: 1px solid #2D3348; border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: #1E2130; color: #E2E8F0; border-color: #3B82F6; } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: #64748B; transition: all 0.15s; } .tab.active { background: #1E2130; color: #E2E8F0; } .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace; } .del-btn { background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; } .del-btn:hover { background: #2D1A1A; } .upload-zone { border: 2px dashed #2D3348; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: #3B82F6; } label { font-size: 12px; color: #64748B; font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 13px; } th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252A3A; } td { padding: 9px 12px; border-bottom: 1px solid #1A1D27; } tr:hover td { background: #161924; }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3B82F6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>insuredbycam.com</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#F1F5F9" }}>Revenue Projections</h1>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>New Business · Goal: {fmtFull$(GOAL)}/mo</div>
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
        <div className="card">
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Written Premium</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalPremium)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{rangeLabel}</div>
        </div>
        {/* Commission Earned */}
        <div className="card">
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Commission Earned</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalCommission)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"}</div>
        </div>
        {/* Policies */}
        <div className="card">
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Policies Written</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>{filtered.reduce((s,e) => s + e.policyCount, 0)}</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Avg premium: {filtered.length > 0 ? fmt$(totals.totalPremium / filtered.reduce((s,e) => s + e.policyCount,0)) : "—"}</div>
        </div>
        {/* Goal */}
        <div className="card" style={{ position: "relative", overflow: "hidden" }}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Goal Progress</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: goalPct >= 1 ? "#10B981" : "#F59E0B", fontFamily: "'DM Mono', monospace" }}>{Math.round(goalPct * 100)}%</div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{fmt$(GOAL - totals.totalPremium > 0 ? GOAL - totals.totalPremium : 0)} remaining</div>
          {/* mini progress bar */}
          <div style={{ height: 3, background: "#252A3A", borderRadius: 2, marginTop: 10 }}>
            <div style={{ height: "100%", width: `${Math.min(goalPct * 100, 100)}%`, background: goalPct >= 1 ? "#10B981" : "#3B82F6", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>
        {/* Pace (month only) */}
        {pace && (
          <div className="card">
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Month-End Pace</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: pace.onPace ? "#10B981" : "#EF4444", fontFamily: "'DM Mono', monospace" }}>{fmt$(pace.projected)}</div>
            <div style={{ fontSize: 11, color: pace.onPace ? "#10B981" : "#EF4444", marginTop: 2 }}>{pace.onPace ? "✓ On pace" : "↓ Behind pace"} · Day {pace.elapsed}/{pace.totalDays}</div>
          </div>
        )}
      </div>

      {/* Progress Bar Full */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: "#94A3B8", fontWeight: 600 }}>$40K Monthly New Business Goal</span>
          <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(totals.totalPremium)} / {fmtFull$(GOAL)}</span>
        </div>
        <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(goalPct * 100, 100)}%`, background: "linear-gradient(90deg, #3B82F6, #8B5CF6)", borderRadius: 5, transition: "width 0.5s" }} />
        </div>
        {/* Product breakdown bars */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {Object.entries(totals.byProduct).map(([key, val]) => val.premium > 0 && (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRODUCT_COLORS[key] }} />
              <span style={{ color: "#64748B" }}>{COMMISSION[key].label}</span>
              <span style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace" }}>{fmt$(val.premium)}</span>
            </div>
          ))}
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
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Monthly Written Premium vs $40K Goal</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [fmtFull$(v), n === "premium" ? "Written Premium" : "Commission"]} />
                <ReferenceLine y={GOAL} stroke="#3B82F6" strokeDasharray="4 4" label={{ value: "$40K", fill: "#3B82F6", fontSize: 11 }} />
                <Bar dataKey="premium" fill="#3B82F6" radius={[4,4,0,0]}>
                  {trendData.map((entry, i) => (
                    <Cell key={i} fill={entry.premium >= GOAL ? "#10B981" : "#3B82F6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By Product Premium */}
          <div className="card">
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
          <div className="card">
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
                      {fmtFull$(val.premium)} premium · {fmtPct(COMMISSION[key].rate)} rate
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 12 }}>Add Manual Entry</div>
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
              <button className="btn-primary" onClick={addEntry}>Add</button>
            </div>
          </div>

          {/* Commission rate reminder */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {Object.entries(COMMISSION).map(([key, val]) => (
              <div key={key} style={{ background: "#1A1D27", border: `1px solid ${PRODUCT_COLORS[key]}33`, borderRadius: 6, padding: "6px 12px", fontSize: 11 }}>
                <span style={{ color: PRODUCT_COLORS[key], fontWeight: 600 }}>{val.label}</span>
                <span style={{ color: "#475569", marginLeft: 6 }}>{fmtPct(val.rate)}</span>
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
                  <th>Date</th><th>Product</th><th>Premium</th><th>Commission</th><th>Source</th><th>Note</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    <td style={{ color: "#64748B", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.date}</td>
                    <td><span className="tag" style={{ background: `${PRODUCT_COLORS[e.product]}22`, color: PRODUCT_COLORS[e.product] }}>{COMMISSION[e.product]?.label}</span></td>
                    <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(e.premium)}</td>
                    <td style={{ color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(calcCommission(e.premium, e.product))}</td>
                    <td><span className="tag" style={{ background: e.source==="upload" ? "#1E3A5F" : "#1E3348", color: e.source==="upload" ? "#60A5FA" : "#94A3B8" }}>{e.source}</span></td>
                    <td style={{ color: "#475569", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</td>
                    <td><button className="del-btn" onClick={() => deleteEntry(e.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ color: "#64748B", fontWeight: 600, paddingTop: 12 }}>Total</td>
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
            Accepts XLSX or CSV. Expects columns: <span style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>Effective Date, Written Premium, Line of Business</span> (or similar Allstate report headers).
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Commission Reference</div>
            <table>
              <thead>
                <tr><th>Product</th><th>New Business Rate</th></tr>
              </thead>
              <tbody>
                {Object.entries(COMMISSION).map(([key, val]) => (
                  <tr key={key}>
                    <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{val.label}</span></td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtPct(val.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
