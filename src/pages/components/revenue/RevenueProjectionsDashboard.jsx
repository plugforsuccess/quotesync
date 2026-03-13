import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { useRevenueEntries } from "../../../hooks/useRevenueEntries";
import { useCurrentAgency } from "../../../hooks/useAgencyLeads";
import { supabase } from "../../../lib/supabase";
import * as XLSX from "xlsx";

// ─── Commission Matrix ────────────────────────────────────────────────────────
// Three-tier rates: Preferred / Bundled / Monoline (new business only)
const COMMISSION = {
  auto:           { preferred: 0.25, bundled: 0.20, monoline: 0.15, label: "Auto" },
  ho:             { preferred: 0.29, bundled: 0.25, monoline: 0.16, label: "Homeowners" },
  condo:          { preferred: 0.29, bundled: 0.25, monoline: 0.16, label: "Condo" },
  renters:        { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Renters" },
  landlord:       { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Landlord" },
  specialty_auto: { preferred: 0.25, bundled: 0.20, monoline: 0.15, label: "Specialty Auto" },
  pup:            { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Personal Umbrella" },
  manufactured:   { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Manufactured Home" },
  boat:           { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Boat Owners" },
  motor_club:     { preferred: 0.25, bundled: 0.25, monoline: 0.25, label: "Motor Club" },
  other:          { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Other Personal Lines" },
};
const TIER_LABELS = { preferred: "Preferred", bundled: "Bundled", monoline: "Monoline" };
const TIER_COLORS = { preferred: "#10B981", bundled: "#3B82F6", monoline: "#64748B" };

const COMMISSION_GOAL = 40000;  // primary goal — commission revenue
const PREMIUM_GOAL    = 160000; // secondary goal — written premium volume
const PRODUCT_COLORS = {
  auto: "#3B82F6", ho: "#10B981", condo: "#34D399", renters: "#F59E0B", other: "#8B5CF6",
  landlord: "#06B6D4", specialty_auto: "#8B5CF6", pup: "#EC4899", manufactured: "#F97316", boat: "#0EA5E9", motor_club: "#F43F5E",
};
const PRODUCT_LABELS = {
  auto: "Auto", ho: "Homeowners", condo: "Condo", renters: "Renters", landlord: "Landlord",
  specialty_auto: "Specialty Auto", pup: "Personal Umbrella",
  manufactured: "Manufactured Home", boat: "Boat Owners", motor_club: "Motor Club", other: "Other",
};

// ─── Portfolio Points Matrix ──────────────────────────────────────────────────
// Points are per ITEM (not per policy). A 2-car auto policy = 2 items × 10 pts = 20 pts.
const PORTFOLIO_POINTS = {
  auto:          10,
  ho:            20,  // Homeowners — always 1 item per policy
  condo:         20,  // Condo — always 1 item per policy
  renters:        5,
  landlord:      20,  // same points as HO but tracked separately
  specialty_auto: 5,  // Motorcycle, motor home, off-road, trailers
  pup:            5,  // Personal Umbrella Policy
  manufactured:   5,  // Manufactured Home
  boat:           5,  // Boat Owners — always 1 item per policy
  motor_club:     0,  // Motor Club — not an Allstate VC Baseline product
  other:          0,
};

// VC Baseline = Auto items + HO items (target 53/month)
const VC_BASELINE_TARGET = 53;

const fmt$ = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n).toLocaleString()}`;
const fmtFull$ = (n) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

// Mask customer PII — show first name + last initial only (e.g. "JAMES L.")
// Handles: "JAMES LOGAN", "MARY JO SMITH", "O'BRIEN PATRICK"
function maskCustomerName(fullName) {
  if (!fullName) return "—";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

// CAT reinsurance retention factors by product
// commissionable premium = written premium × retention factor
// Source: Allstate CAT reinsurance premium schedule
const COMMISSIONABLE_FACTORS = {
  auto:           0.998,  // 0.2% CAT reinsurance
  specialty_auto: 0.998,  // 0.2% CAT reinsurance
  ho:             0.935,  // 6.5% CAT reinsurance (HO3 Homeowners)
  condo:          0.959,  // 4.1% CAT reinsurance (HO6 Condo)
  renters:        1.000,  // no CAT reinsurance
  landlord:       1.000,  // no CAT reinsurance
  pup:            1.000,  // no CAT reinsurance
  manufactured:   1.000,  // no CAT reinsurance
  boat:           1.000,  // no CAT reinsurance
  motor_club:     1.000,  // no CAT reinsurance
  other:          1.000,  // no CAT reinsurance
};

function calcCommission(premium, product, tier = "monoline") {
  const rates = COMMISSION[product] ?? COMMISSION.other;
  const factor = COMMISSIONABLE_FACTORS[product] ?? 1.0;
  return premium * factor * (rates[tier] ?? rates.monoline);
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
function countBusinessDays(start, end) {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ─── Empty entry template ─────────────────────────────────────────────────────
const emptyEntry = () => ({
  id: crypto.randomUUID(),
  date: TODAY.toISOString().slice(0, 10),
  product: "auto",
  tier: "monoline",
  premium: "",
  policyCount: 1,
  itemCount: 1,
  policyNo: "",
  source: "manual",
  note: "",
});

// ─── Parse uploaded Allstate CSV/XLSX rows ───────────────────────────────────
function parseAllstateRows(rows) {
  // Best-effort mapping for common Allstate export column names
  const COL_MAP = {
    date_written: ["date written", "written date"],
    issued_date:  ["issued date", "issue date", "effective date", "policy date", "eff date", "date"],
    premium: ["written premium", "premium", "annual premium", "prem"],
    product: ["line of business", "lob", "product", "type"],
    policy:  ["policy number", "policy #", "policy no"],
    tier:    ["bundle tier", "tier", "bundle"],
    items:   ["item count", "items", "vehicle count", "vehicles"],
  };
  const findCol = (headers, keys) => {
    const h = headers.map((x) => x?.toString().toLowerCase().trim());
    for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
    return -1;
  };

  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  const di         = findCol(headers, COL_MAP.issued_date);
  const dWritten   = findCol(headers, COL_MAP.date_written);
  const pi      = findCol(headers, COL_MAP.premium);
  const li      = findCol(headers, COL_MAP.product);
  const iTier   = findCol(headers, COL_MAP.tier);   // -1 if column absent
  const iPolicyNo = findCol(headers, COL_MAP.policy); // -1 if column absent
  const iItems  = findCol(headers, COL_MAP.items);  // -1 if absent

  // New Business Details report columns
  const iBindId      = findCol(headers, ["bind id"]);
  const iBindName    = findCol(headers, ["bind id name"]);
  const iProductDesc = findCol(headers, ["product description", "product desc"]);
  const iCustomer    = findCol(headers, ["customer name", "customer", "insured"]);

  return rows.slice(1).filter(r => r.some(Boolean)).map((r) => {
    // Prefer Product Description (col 11) over Product (col 9) when available
    const raw = (iProductDesc >= 0 ? r[iProductDesc]?.toString().toLowerCase() : r[li]?.toString().toLowerCase()) ?? "";
    let product = "other";
    // specialty auto must be checked BEFORE standard auto to avoid false match
    if (raw.includes("specialty auto") || raw.includes("motorcycle") || raw.includes("motor home") || raw.includes("off-road") || raw.includes("trailer")) product = "specialty_auto";
    else if (raw.includes("standard auto") || raw.includes("private passenger")) product = "auto";
    else if (raw.includes("condo") || raw.includes("ho6")) product = "condo";
    else if (raw.includes("home") || raw.includes("ho3")) product = "ho";
    else if (raw.includes("rent") || raw.includes("ho4")) product = "renters";
    else if (raw.includes("landlord")) product = "landlord";
    else if (raw.includes("umbrella") || raw.includes("pup")) product = "pup";
    else if (raw.includes("manufactured")) product = "manufactured";
    else if (raw.includes("boat") || raw.includes("watercraft") || raw.includes("inland marine")) product = "boat";
    else if (raw.includes("motor club")) product = "motor_club";
    else product = "other";

    // Only auto and specialty_auto can have multiple items per policy
    const SINGLE_ITEM_PRODUCTS = ["ho", "condo", "renters", "landlord", "pup", "manufactured", "boat", "motor_club"];
    const rawItemCount = iItems >= 0 ? parseInt(r[iItems]) || 1 : 1;
    const itemCount = SINGLE_ITEM_PRODUCTS.includes(product) ? 1 : rawItemCount;

    const rawIssued  = di >= 0       ? r[di]       : null;
    const rawWritten = dWritten >= 0 ? r[dWritten] : null;

    let issuedDateStr  = TODAY.toISOString().slice(0, 10);
    let writtenDateStr = null;

    if (rawIssued) {
      const d = new Date(rawIssued);
      if (!isNaN(d)) issuedDateStr = d.toISOString().slice(0, 10);
    }
    if (rawWritten) {
      const d = new Date(rawWritten);
      if (!isNaN(d)) writtenDateStr = d.toISOString().slice(0, 10);
    }

    // Skip endorsements: if both dates are present and differ, this is not NB
    if (writtenDateStr && writtenDateStr !== issuedDateStr) return null;

    const date = issuedDateStr;

    return {
      id: crypto.randomUUID(),
      date,
      product,
      tier:         normalizeTier(iTier >= 0 ? r[iTier] : ""),
      premium:      parseFloat(r[pi]?.toString().replace(/[$,]/g, "")) || 0,
      policyCount:  1,
      itemCount,
      policyNo:     iPolicyNo >= 0 ? (r[iPolicyNo]?.toString().trim() || null) : null,
      bindId:       iBindId >= 0   ? (r[iBindId]?.toString().trim() || null) : null,
      bindIdName:   iBindName >= 0 ? (r[iBindName]?.toString().trim() || null) : null,
      customerName: iCustomer >= 0 ? (r[iCustomer]?.toString().trim() || null) : null,
      source:       "upload",
      note:         r[li]?.toString() ?? "",
    };
  }).filter(e => e !== null && e.premium > 0 && e.bindId !== "USSGOVP");
}

// ─── Sortable Table Header ────────────────────────────────────────────────────
function SortTh({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ fontSize: 9, color: active ? "#E2E8F0" : "#334155", lineHeight: 1 }}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}

// ─── Drill-Down Modal ─────────────────────────────────────────────────────────
function DrillDownModal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 8 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#161924", border: "1px solid #252A3A", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: "98vw", height: "96vh", overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px 16px", borderBottom: "1px solid #252A3A", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer", minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px", minHeight: 0, display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Product Breakdown Rows ───────────────────────────────────────────────────
function ProductBreakdownRows({ byProduct, totalPremium, totalCommission }) {
  const rows = Object.entries(byProduct)
    .filter(([, v]) => v.premium > 0)
    .sort(([, a], [, b]) => b.premium - a.premium);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", paddingRight: 4 }}>
        <span>Product</span>
        <span style={{ display: "flex", gap: 16 }}>
          <span style={{ width: 72, textAlign: "right" }}>Premium</span>
          <span style={{ width: 44, textAlign: "right" }}>% Mix</span>
          <span style={{ width: 72, textAlign: "right" }}>Commission</span>
          <span style={{ width: 52, textAlign: "right" }}>Rate</span>
          <span style={{ width: 72, textAlign: "right" }}>Avg/Item</span>
          <span style={{ width: 44, textAlign: "right" }}>Policies</span>
        </span>
      </div>
      {rows.map(([key, val]) => {
        const premiumPct = totalPremium > 0 ? val.premium / totalPremium : 0;
        const commPct    = totalCommission > 0 ? val.commission / totalCommission : 0;
        const effRate    = val.premium > 0 ? val.commission / val.premium : 0;
        return (
          <div key={key}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: PRODUCT_COLORS[key], display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{COMMISSION[key].label}</span>
              </span>
              <span style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                <span style={{ width: 72, textAlign: "right", color: "#E2E8F0" }}>{fmtFull$(val.premium)}</span>
                <span style={{ width: 44, textAlign: "right", color: "#94A3B8", fontWeight: 600 }}>{(premiumPct * 100).toFixed(1)}%</span>
                <span style={{ width: 72, textAlign: "right", color: "#10B981" }}>{fmtFull$(val.commission)}</span>
                <span style={{ width: 52, textAlign: "right", color: "#64748B" }}>{fmtPct(effRate)}</span>
                <span style={{ width: 72, textAlign: "right", color: "#94A3B8" }}>{val.itemCount > 0 ? fmtFull$(Math.round(val.premium / val.itemCount)) : "—"}</span>
                <span style={{ width: 44, textAlign: "right", color: "#64748B" }}>{val.count}</span>
              </span>
            </div>
            <div style={{ height: 7, background: "#252A3A", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${premiumPct * 100}%`, background: `${PRODUCT_COLORS[key]}33`, borderRadius: 4 }} />
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${commPct * 100}%`, background: PRODUCT_COLORS[key], borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#334155", marginTop: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 3, background: "#3B82F633", borderRadius: 2, display: "inline-block" }} />
          Premium share
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 3, background: "#3B82F6", borderRadius: 2, display: "inline-block" }} />
          Commission share
        </span>
      </div>
    </div>
  );
}

// ─── Friendly error messages ──────────────────────────────────────────────────
function friendlyUploadError(raw = "") {
  const msg = raw.toLowerCase();

  if (msg.includes("conflict do update command cannot affect row a second time"))
    return "Your report contains duplicate policy numbers. Remove the duplicates and re-upload.";

  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("using expression"))
    return "Permission error — your session may have expired. Please refresh the page and try again.";

  if (msg.includes("unique or exclusion constraint"))
    return "Database configuration error. Please contact your administrator.";

  if (msg.includes("violates check constraint") && msg.includes("product"))
    return "One or more rows contains an unrecognized product type. Check the report for unexpected policy categories.";

  if (msg.includes("violates not-null constraint"))
    return "One or more required fields are missing. Ensure the report has Policy Number, Product, Premium, and Date columns.";

  if (msg.includes("invalid input syntax for type"))
    return "A value in the report couldn't be read — check for non-numeric premiums or invalid dates.";

  if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch"))
    return "Connection error — check your internet and try again.";

  // Fallback: show something generic but not raw Postgres
  return "Upload failed. If this keeps happening, screenshot this and contact support.";
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RevenueProjectionsDashboard() {
  const { data: currentAgency } = useCurrentAgency();
  const agencyId = currentAgency?.agency_id;
  const [newEntry, setNewEntry] = useState(emptyEntry());
  const [view, setView] = useState("month"); // month | ytd | custom
  const [customStart, setCustomStart] = useState(""); // "YYYY-MM-DD"
  const [customEnd,   setCustomEnd]   = useState(""); // "YYYY-MM-DD"
  const [customOpen,  setCustomOpen]  = useState(false); // show date inputs inline
  const [paceMode, setPaceMode] = useState("commission");       // commission | premium
  const [dailyTargetMode, setDailyTargetMode] = useState("commission"); // commission | premium | policies
  const [goalMode, setGoalMode] = useState("commission"); // commission | premium
  const [policiesMode, setPoliciesMode] = useState("count"); // count | items | points
  const [modalMode, setModalMode] = useState("commission");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);
  const [addEntryMsg, setAddEntryMsg] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview | entries | upload
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [modal, setModal] = useState(null); // null | "commission" | "premium" | "trend" | "products" | "kpi-*"
  const [productStatsMode, setProductStatsMode] = useState("all"); // "all" | "vc" | "nonvc"
  const [producerModal, setProducerModal] = useState(null); // null | producer name string
  const [producerRange, setProducerRange] = useState("main"); // "main" | "ytd" | "YYYY-MM" | "custom"
  const [producerCustomStart, setProducerCustomStart] = useState(""); // "YYYY-MM-DD"
  const [producerCustomEnd, setProducerCustomEnd]   = useState(""); // "YYYY-MM-DD"
  const [producerCustomOpen, setProducerCustomOpen] = useState(false); // show custom date inputs
  const [sortCol, setSortCol] = useState("date");   // "date" | "issuedDate" | "product" | "tier" | "premium" | "commission" | "source"
  const [sortDir, setSortDir] = useState("desc");   // "asc" | "desc"
  const [ratesOpen, setRatesOpen] = useState(window.innerWidth >= 768);
  const closeModal = () => { setModal(null); setProductStatsMode("all"); };
  const fileRef = useRef();
  const paceClickTimer  = useRef(null);
  const dailyClickTimer = useRef(null);
  const goalClickTimer  = useRef(null);
  const policiesClickTimer = useRef(null);

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
    if (view === "custom" && customStart && customEnd) {
      const s = new Date(customStart + "T00:00:00");
      const e = new Date(customEnd   + "T23:59:59");
      if (s > e) return { rangeStart: new Date(9999,0,1), rangeEnd: new Date(9999,0,1), label: "Custom Range" };
      const fmtDate = (d) => `${MONTH_NAMES[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
      return {
        rangeStart: s,
        rangeEnd:   e,
        label:      `${fmtDate(s)} – ${fmtDate(e)}`,
      };
    }
    if (view === "custom") {
      return { rangeStart: new Date(9999,0,1), rangeEnd: new Date(9999,0,1), label: "Custom Range" };
    }
    // fallback (should not reach)
    return { rangeStart: new Date(y, m, 1), rangeEnd: new Date(y, m + 1, 0), label: `${MONTH_NAMES[m]} ${y}` };
  }, [view, customStart, customEnd]);

  const { entries, loading, error, addEntry, addEntries, deleteEntry } = useRevenueEntries({ agencyId, rangeStart, rangeEnd });

  // Fetch all entries for the current year — used by producer breakdown range filter
  const [allYearEntries, setAllYearEntries] = useState([]);
  useEffect(() => {
    if (!agencyId) return;
    const ytdStart = `${TODAY.getFullYear()}-01-01`;
    const ytdEnd   = `${TODAY.getFullYear()}-12-31`;
    supabase
      .from("revenue_entries")
      .select("*")
      .eq("agency_id", agencyId)
      .gte("issued_date", ytdStart)
      .lte("issued_date", ytdEnd)
      .order("issued_date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        setAllYearEntries(data.map(r => ({
          id:           r.id,
          date:         r.issued_date,
          issuedDate:   r.issued_date,
          product:      r.product,
          tier:         r.tier ?? "monoline",
          premium:      parseFloat(r.premium),
          policyCount:  r.policy_count,
          itemCount:    r.item_count ?? 1,
          policyNo:     r.policy_no ?? null,
          bindId:       r.bind_id ?? null,
          producerName: r.producer_name ?? null,
          customerName: r.customer_name ?? null,
          source:       r.source,
          note:         r.note ?? "",
        })));
      });
  }, [agencyId]);

  // ─── Filtered entries ──────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    entries.filter(e => {
      const d = new Date(e.date);
      return d >= rangeStart && d <= rangeEnd;
    }), [entries, rangeStart, rangeEnd]);

  // ─── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "date" || col === "issuedDate" ? "desc" : "asc");
    }
  };

  // ─── Sorted entries ────────────────────────────────────────────────────────
  const sortedEntries = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "date":       av = a.date;       bv = b.date;       break;
        case "issuedDate": av = a.issuedDate; bv = b.issuedDate; break;
        case "product":    av = a.product;    bv = b.product;    break;
        case "tier":       av = a.tier;       bv = b.tier;       break;
        case "premium":    av = a.premium;    bv = b.premium;    break;
        case "commission":
          av = calcCommission(a.premium, a.product, a.tier);
          bv = calcCommission(b.premium, b.product, b.tier);
          break;
        case "source":     av = a.source;     bv = b.source;     break;
        default:           av = a.date;       bv = b.date;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir]);

  // ─── Aggregated totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const base = { premium: 0, commission: 0, count: 0, itemCount: 0 };
    const byProduct = {
      auto: {...base}, ho: {...base}, condo: {...base}, renters: {...base},
      landlord: {...base}, specialty_auto: {...base}, pup: {...base},
      manufactured: {...base}, boat: {...base}, motor_club: {...base}, other: {...base},
    };
    filtered.forEach(e => {
      const c = calcCommission(e.premium, e.product, e.tier ?? "monoline");
      const p = byProduct[e.product] ?? byProduct.other;
      p.premium += e.premium;
      p.commission += c;
      p.count += e.policyCount;
      p.itemCount += e.itemCount ?? 1;
    });
    const totalPremium = Object.values(byProduct).reduce((s, v) => s + v.premium, 0);
    const totalCommission = Object.values(byProduct).reduce((s, v) => s + v.commission, 0);

    return { byProduct, totalPremium, totalCommission };
  }, [filtered]);

  // ─── Policies stats (items, VC baseline, portfolio points) ───────────────
  const policiesStats = useMemo(() => {
    const totalPolicies = filtered.reduce((s, e) => s + e.policyCount, 0);

    // VC Baseline = auto items + HO items + condo items (HO always itemCount=1)
    const vcBaselineCount = filtered.reduce((s, e) => {
      if (e.product === "auto" || e.product === "ho" || e.product === "condo") return s + e.itemCount;
      return s;
    }, 0);

    // Portfolio points = PORTFOLIO_POINTS[product] × itemCount
    const totalPoints = filtered.reduce((s, e) => {
      const pts = PORTFOLIO_POINTS[e.product] ?? 0;
      return s + pts * e.itemCount;
    }, 0);

    // Prior month — derived from rangeStart so historical views work correctly
    const priorStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 1, 1).toISOString().slice(0, 10);
    const priorEnd   = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 0).toISOString().slice(0, 10);
    const priorEntries = entries.filter(e => e.date >= priorStart && e.date <= priorEnd);
    const priorPoints  = priorEntries.reduce((s, e) => {
      const pts = PORTFOLIO_POINTS[e.product] ?? 0;
      return s + pts * (e.itemCount ?? 1);
    }, 0);

    const pointsDelta = totalPoints - priorPoints;

    return { totalPolicies, vcBaselineCount, totalPoints, priorPoints, pointsDelta };
  }, [filtered, entries, rangeStart]);

  // ─── Producer-filtered entries (independent range) ─────────────────────────
  const producerFiltered = useMemo(() => {
    const todayStr = TODAY.toISOString().slice(0, 10);

    if (producerRange === "main") return filtered;

    if (producerRange === "ytd") {
      const ytdStart = `${TODAY.getFullYear()}-01-01`;
      return allYearEntries.filter(e => e.date && e.date >= ytdStart && e.date <= todayStr);
    }

    if (producerRange === "custom") {
      if (!producerCustomStart || !producerCustomEnd) return [];
      return allYearEntries.filter(e => e.date && e.date >= producerCustomStart && e.date <= producerCustomEnd);
    }

    return filtered;
  }, [producerRange, producerCustomStart, producerCustomEnd, filtered, allYearEntries]);

  // ─── Producer breakdown ────────────────────────────────────────────────────
  const byProducer = useMemo(() => {
    const map = {};
    producerFiltered.forEach(e => {
      const name = e.producerName || "Unassigned";
      if (!map[name]) map[name] = { name, policies: 0, items: 0, premium: 0, commission: 0, points: 0 };
      map[name].policies   += 1;
      map[name].items      += e.itemCount ?? 1;
      map[name].premium    += e.premium ?? 0;
      map[name].commission += calcCommission(e.premium ?? 0, e.product, e.tier ?? "monoline");
      map[name].points     += (PORTFOLIO_POINTS[e.product] ?? 0) * (e.itemCount ?? 1);
    });
    const totalCommission = Object.values(map).reduce((s, p) => s + p.commission, 0);
    return Object.values(map)
      .map(p => ({
        ...p,
        share: totalCommission > 0 ? p.commission / totalCommission : 0,
        blendedRate: p.premium > 0 ? p.commission / p.premium : 0,
      }))
      .sort((a, b) => {
        const aLast = a.name === "CCC" || a.name === "Unassigned";
        const bLast = b.name === "CCC" || b.name === "Unassigned";
        if (aLast && !bLast) return 1;
        if (!aLast && bLast) return -1;
        return b.commission - a.commission;
      });
  }, [producerFiltered]);

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
    const monthStart = new Date(y, m, 1);
    const monthEnd   = new Date(y, m + 1, 0);
    const businessDaysTotal   = countBusinessDays(monthStart, monthEnd);
    const businessDaysElapsed = countBusinessDays(monthStart, TODAY);
    const projectedCommission = businessDaysElapsed > 0 ? (totals.totalCommission / businessDaysElapsed) * businessDaysTotal : 0;
    const projectedPremium    = businessDaysElapsed > 0 ? (totals.totalPremium    / businessDaysElapsed) * businessDaysTotal : 0;
    return { projectedCommission, projectedPremium, elapsed: businessDaysElapsed, totalDays: businessDaysTotal, onPace: projectedCommission >= COMMISSION_GOAL };
  }, [view, totals.totalCommission, totals.totalPremium]);

  // ─── Goal pcts ────────────────────────────────────────────────────────────
  const commissionGoalPct = Math.min(totals.totalCommission / COMMISSION_GOAL, 1);
  const goalModes = {
    commission: {
      label: "COMMISSION GOAL",
      pct: commissionGoalPct,
      earned: totals.totalCommission,
      goal: COMMISSION_GOAL,
      barColor: commissionGoalPct >= 1 ? "#10B981" : "linear-gradient(90deg, #10B981, #3B82F6)",
      valueColor: commissionGoalPct >= 1 ? "#10B981" : "#F59E0B",
    },
    premium: {
      label: "PREMIUM GOAL",
      pct: Math.min(totals.totalPremium / PREMIUM_GOAL, 1),
      earned: totals.totalPremium,
      goal: PREMIUM_GOAL,
      barColor: "linear-gradient(90deg, #3B82F6, #8B5CF6)",
      valueColor: "#3B82F6",
    },
  };
  const activeGoal = goalModes[goalMode];

  // ─── Last-month commission (for MoM delta) ────────────────────────────────
  const lastMonthCommission = useMemo(() => {
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    const start = new Date(y, m - 1, 1);
    const end   = new Date(y, m, 0);
    return entries
      .filter(e => { const d = new Date(e.date); return d >= start && d <= end; })
      .reduce((s, e) => s + calcCommission(e.premium, e.product, e.tier ?? "monoline"), 0);
  }, [entries]);

  // ─── Daily target (month view only) ───────────────────────────────────────
  const dailyTarget = useMemo(() => {
    if (view !== "month") return null;
    const y = TODAY.getFullYear(), m = TODAY.getMonth();
    const tomorrow  = new Date(y, m, todayDayOfMonth() + 1);
    const monthEnd  = new Date(y, m + 1, 0);
    const remaining = countBusinessDays(tomorrow, monthEnd);
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
    if (!premium || premium <= 0) {
      setAddEntryMsg("Enter a valid premium amount greater than $0.");
      return;
    }

    setAddingEntry(true);
    setAddEntryMsg("");
    const { error } = await addEntry({ ...newEntry, premium });
    if (error) {
      console.error("[revenue upload error]", error);
      setAddEntryMsg(`❌ ${friendlyUploadError(error)}`);
    } else {
      setNewEntry(emptyEntry());
      setAddEntryMsg("Entry added.");
    }
    setAddingEntry(false);
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
        // Build bind ID → employee name map from employee_producer_codes
        let employeeBindMap = new Map();
        if (agencyId) {
          const { data: codeData } = await supabase
            .from("employee_producer_codes")
            .select("code, employees(first_name, last_name, preferred_name)")
            .eq("agency_id", agencyId)
            .eq("carrier", "allstate");
          employeeBindMap = new Map(
            (codeData ?? []).map(row => {
              const e = row.employees;
              return [
                row.code,
                e?.preferred_name || `${e?.first_name ?? ""} ${e?.last_name ?? ""}`.trim() || "Unknown"
              ];
            })
          );
        }
        const { count, error } = await addEntries(parsed, employeeBindMap);
        if (error) {
          console.error("[revenue upload error]", error);
          setUploadMsg(`❌ ${friendlyUploadError(error)}`);
        } else {
          setUploadMsg(`✅ ${count} ${count === 1 ? "policy" : "policies"} loaded from ${file.name} — revenue totals updated.`);
        }
      }
    } catch (err) {
      console.error("[revenue upload error]", err.message);
      setUploadMsg(`❌ ${friendlyUploadError(err.message)}`);
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
      PRODUCT_LABELS[e.product] ?? e.product,
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

  // ─── Card click handlers ──────────────────────────────────────────────────
  const handlePaceClick = () => {
    if (paceClickTimer.current) {
      clearTimeout(paceClickTimer.current);
      paceClickTimer.current = null;
      setModalMode(paceMode);
      setModal("pace");
    } else {
      paceClickTimer.current = setTimeout(() => {
        setPaceMode(m => m === "commission" ? "premium" : "commission");
        paceClickTimer.current = null;
      }, 300);
    }
  };

  const handleDailyClick = () => {
    if (dailyClickTimer.current) {
      clearTimeout(dailyClickTimer.current);
      dailyClickTimer.current = null;
      setModalMode(dailyTargetMode);
      setModal("daily");
    } else {
      dailyClickTimer.current = setTimeout(() => {
        setDailyTargetMode(m =>
          m === "commission" ? "premium" : m === "premium" ? "policies" : "commission"
        );
        dailyClickTimer.current = null;
      }, 300);
    }
  };

  const handleGoalClick = () => {
    if (goalClickTimer.current) {
      clearTimeout(goalClickTimer.current);
      goalClickTimer.current = null;
      setModalMode(goalMode);
      setModal("kpi-goal");
    } else {
      goalClickTimer.current = setTimeout(() => {
        setGoalMode(m => m === "commission" ? "premium" : "commission");
        goalClickTimer.current = null;
      }, 300);
    }
  };

  const handlePoliciesClick = () => {
    if (policiesClickTimer.current) {
      clearTimeout(policiesClickTimer.current);
      policiesClickTimer.current = null;
      // Double-click → open modal appropriate to current mode
      if (policiesMode === "points") setModal("kpi-points");
      else if (policiesMode === "items") setModal("kpi-vc-baseline");
      else setModal("kpi-policies");
      return;
    }
    policiesClickTimer.current = setTimeout(() => {
      setPoliciesMode(m =>
        m === "count" ? "items" : m === "items" ? "points" : "count"
      );
      policiesClickTimer.current = null;
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (paceClickTimer.current) clearTimeout(paceClickTimer.current);
      if (dailyClickTimer.current) clearTimeout(dailyClickTimer.current);
      if (goalClickTimer.current) clearTimeout(goalClickTimer.current);
      if (policiesClickTimer.current) clearTimeout(policiesClickTimer.current);
    };
  }, []);

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0F1117", minHeight: "100vh", color: "#E2E8F0", padding: "24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1A1D27; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; } input, select { background: #1E2130 !important; color: #E2E8F0 !important; border: 1px solid #2D3348 !important; border-radius: 6px; padding: 8px 10px; font-family: inherit; font-size: 13px; outline: none; } input:focus, select:focus { border-color: #3B82F6 !important; } .card { background: #161924; border: 1px solid #252A3A; border-radius: 12px; padding: 20px; } .btn-primary { background: #3B82F6; color: #fff; border: none; border-radius: 7px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; } .btn-primary:hover { background: #2563EB; } .btn-ghost { background: transparent; color: #94A3B8; border: 1px solid #2D3348; border-radius: 7px; padding: 8px 14px; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; } .btn-ghost:hover, .btn-ghost.active { background: #1E2130; color: #E2E8F0; border-color: #3B82F6; } .tab { padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; border: none; background: transparent; color: #64748B; transition: all 0.15s; } .tab.active { background: #1E2130; color: #E2E8F0; } .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: 'DM Mono', monospace; } .del-btn { background: transparent; border: none; color: #EF4444; cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; } .del-btn:hover { background: #2D1A1A; } .upload-zone { border: 2px dashed #2D3348; border-radius: 10px; padding: 40px; text-align: center; cursor: pointer; transition: border-color 0.2s; } .upload-zone:hover { border-color: #3B82F6; } label { font-size: 12px; color: #64748B; font-weight: 500; display: block; margin-bottom: 4px; } table { width: 100%; border-collapse: collapse; font-size: 14px; } th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #252A3A; } td { padding: 9px 12px; border-bottom: 1px solid #1A1D27; color: #CBD5E1; } tr:hover td { background: #161924; } .clickable { cursor: pointer; transition: border-color 0.15s; } .clickable:hover { border-color: #3B82F6; }`}</style>

      {error && (
        <div style={{ background: "#2D1A1A", border: "1px solid #EF4444", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>Loading entries...</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3B82F6", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>insuredbycam.com</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#F1F5F9" }}>Revenue Projections</h1>
          <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>New Business · Commission Goal: {fmtFull$(COMMISSION_GOAL)}/mo</div>
        </div>
        {/* View selector */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {[["month","This Month"],["ytd","YTD"]].map(([v,l]) => (
            <button
              key={v}
              className={`btn-ghost ${view===v?"active":""}`}
              onClick={() => { setView(v); setCustomOpen(false); }}
            >
              {l}
            </button>
          ))}
          <button
            className={`btn-ghost ${view==="custom"?"active":""}`}
            onClick={() => { setView("custom"); setCustomOpen(true); }}
          >
            Custom Range
          </button>

          {/* Inline date pickers — only visible when custom is active */}
          {view === "custom" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={e => setCustomStart(e.target.value)}
                style={{
                  background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
                  color: "#F1F5F9", fontSize: 13, padding: "4px 8px", cursor: "pointer"
                }}
              />
              <span style={{ color: "#64748B", fontSize: 12 }}>to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={e => setCustomEnd(e.target.value)}
                style={{
                  background: "#1E293B", border: "1px solid #334155", borderRadius: 6,
                  color: "#F1F5F9", fontSize: 13, padding: "4px 8px", cursor: "pointer"
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {/* Written Premium */}
        <div className="card clickable" onClick={() => setModal("kpi-written")}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Written Premium</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalPremium)}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{rangeLabel}</div>
        </div>
        {/* Commission Earned */}
        <div className="card clickable" onClick={() => setModal("kpi-commission")}>
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Commission Earned</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalCommission)}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"}</div>
          {view === "month" && lastMonthCommission > 0 && (() => {
            const delta = totals.totalCommission - lastMonthCommission;
            const pct   = Math.abs(delta / lastMonthCommission * 100).toFixed(1);
            return (
              <div style={{ fontSize: 12, color: delta >= 0 ? "#10B981" : "#EF4444", marginTop: 4 }}>
                {delta >= 0 ? "▲" : "▼"} {fmtFull$(Math.abs(delta))} ({pct}%) vs last mo
              </div>
            );
          })()}
        </div>
        {/* Policies Written — cycling card */}
        {(() => {
          const { totalPolicies, vcBaselineCount, totalPoints, pointsDelta } = policiesStats;
          const vcShortfall = VC_BASELINE_TARGET - vcBaselineCount;
          const vcOnTrack   = vcBaselineCount >= VC_BASELINE_TARGET;

          const modes = {
            count: {
              label: "POLICIES WRITTEN",
              value: String(totalPolicies),
              sub: `Avg premium: ${totalPolicies > 0 ? fmt$(totals.totalPremium / totalPolicies) : "—"}`,
              subColor: "#64748B",
            },
            ...(view !== "ytd" ? {
              items: {
                label: "VC BASELINE",
                value: String(vcBaselineCount),
                sub: vcOnTrack
                  ? `✓ ${vcBaselineCount} / ${VC_BASELINE_TARGET} (Auto + HO + Condo)`
                  : `${vcBaselineCount} / ${VC_BASELINE_TARGET} · ${vcShortfall} needed`,
                subColor: vcOnTrack ? "#10B981" : "#F59E0B",
              },
            } : {
              items: {
                label: "ITEMS WRITTEN",
                value: String(filtered.reduce((s, e) => s + (e.itemCount ?? 1), 0)),
                sub: "Total items YTD",
                subColor: "#64748B",
              },
            }),
            points: {
              label: "PORTFOLIO POINTS",
              value: String(totalPoints),
              sub: view !== "ytd"
                ? (pointsDelta >= 0 ? `+${pointsDelta} vs last month` : `${pointsDelta} vs last month`)
                : "Portfolio points YTD",
              subColor: view !== "ytd"
                ? (pointsDelta >= 0 ? "#10B981" : "#EF4444")
                : "#64748B",
            },
          };

          const active = modes[policiesMode];

          return (
            <div
              className="card clickable"
              onClick={handlePoliciesClick}
              title="Click to cycle · Double-click to expand"
              style={{ position: "relative" }}
            >
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                {active.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace" }}>
                {active.value}
              </div>
              <div style={{ fontSize: 12, color: active.subColor, marginTop: 2 }}>
                {active.sub}
              </div>
              {/* Mode indicator dots */}
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["count", "items", "points"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: policiesMode === m ? "#E2E8F0" : "#334155", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}
        {/* Commission Goal / YTD Commission */}
        <div className="card clickable" style={{ position: "relative", overflow: "hidden" }} onClick={handleGoalClick} title="Click to switch · Double-click to expand">
          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            {view !== "ytd" ? activeGoal.label : "YTD COMMISSION"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: view === "ytd" ? "#10B981" : activeGoal.valueColor, fontFamily: "'DM Mono', monospace" }}>
            {view !== "ytd" ? fmtFull$(activeGoal.earned) : fmtFull$(totals.totalCommission)}
          </div>
          {view !== "ytd" ? (
            <>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                {Math.round(activeGoal.pct * 100)}% of {fmtFull$(activeGoal.goal)} goal
              </div>
              <div style={{ height: 3, background: "#252A3A", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(activeGoal.pct * 100, 100)}%`, background: activeGoal.barColor, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: goalMode === m ? "#E2E8F0" : "#334155", transition: "background 0.2s" }} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {rangeLabel} · {fmtFull$(COMMISSION_GOAL)}/mo goal
            </div>
          )}
        </div>
        {/* Pace (month only) */}
        {view === "month" && pace && (() => {
          const paceModeConfig = {
            commission: {
              label: "PROJECTED COMMISSION",
              value: fmt$(pace.projectedCommission),
              subLabel: "projected by month-end",
              color: pace.onPace ? "#10B981" : pace.projectedCommission < COMMISSION_GOAL * 0.5 ? "#EF4444" : "#F59E0B",
            },
            premium: {
              label: "PROJECTED PREMIUM",
              value: fmt$(pace.projectedPremium),
              subLabel: "projected by month-end",
              color: "#3B82F6",
            },
          };
          const activePace = paceModeConfig[paceMode];
          return (
            <div className="card clickable" onClick={handlePaceClick} title="Click to switch · Double-click to expand">
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{activePace.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: activePace.color, fontFamily: "'DM Mono', monospace" }}>{activePace.value}</div>
              <div style={{ fontSize: 12, color: activePace.color, marginTop: 2 }}>{pace.onPace ? "↑ On pace" : "↓ Behind pace"} · {dailyTarget.remaining} business days left</div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>{activePace.subLabel}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: paceMode === m ? "#E2E8F0" : "#334155", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}
        {dailyTarget && (() => {
          const dailyModes = {
            commission: { label: "DAILY TARGET",         value: fmtFull$(dailyTarget.dailyCommissionNeeded),            unit: "commission / day", color: "#F59E0B" },
            premium:    { label: "DAILY PREMIUM TARGET", value: fmtFull$(dailyTarget.dailyPremiumNeeded),               unit: "premium / day",    color: "#3B82F6" },
            policies:   { label: "POLICIES / DAY",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—",   unit: "policies needed",  color: "#10B981" },
          };
          const activeDaily = dailyModes[dailyTargetMode];
          return (
            <div className="card clickable" onClick={handleDailyClick} title="Click to switch · Double-click to expand">
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{activeDaily.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: activeDaily.color, fontFamily: "'DM Mono', monospace" }}>{activeDaily.value}</div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{activeDaily.unit} · {dailyTarget.remaining} business days left</div>
              <div style={{ borderTop: "1px solid #252A3A", marginTop: 10, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {Object.entries(dailyModes)
                  .filter(([key]) => key !== dailyTargetMode)
                  .map(([key, m]) => (
                    <div key={key} style={{ fontSize: 11, color: "#64748B" }}>
                      <span style={{ color: m.color, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{m.value}</span>
                      {" "}{m.unit}
                    </div>
                  ))
                }
              </div>
              {dailyTarget.avgCommissionPerPolicy && (
                <div style={{ fontSize: 10, color: "#334155", marginTop: 6 }}>
                  Avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy
                </div>
              )}
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium", "policies"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: dailyTargetMode === m ? "#E2E8F0" : "#334155", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Goal Tracking (month only) */}
      {view === "month" && <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
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
      </div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
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
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12, color: "#E2E8F0" }} itemStyle={{ color: "#E2E8F0" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: "$40K", fill: "#10B981", fontSize: 11 }} />
                <Bar dataKey="commission" radius={[4,4,0,0]}>
                  {trendData.map((entry, i) => (
                    <Cell key={i} fill={entry.commission >= COMMISSION_GOAL ? "#10B981" : "#3B82F6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue by Product Line */}
          <div className="card clickable" style={{ gridColumn: "1 / -1" }} onClick={() => { setModal("products"); setProductStatsMode("all"); }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 16 }}>Revenue by Product Line</div>
            {totals.totalPremium === 0 ? (
              <div style={{ color: "#334155", textAlign: "center", padding: "30px 0", fontSize: 13 }}>No data in range</div>
            ) : (
              <ProductBreakdownRows
                byProduct={totals.byProduct}
                totalPremium={totals.totalPremium}
                totalCommission={totals.totalCommission}
              />
            )}
          </div>

          {/* Producer Leaderboard */}
          {byProducer.length > 0 && byProducer.some(p => p.name !== "Unassigned") && (
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              {/* Card header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: producerCustomOpen ? 12 : 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8" }}>Producer Breakdown</div>

                <select
                  value={producerRange}
                  onChange={e => {
                    const val = e.target.value;
                    setProducerRange(val);
                    setProducerCustomOpen(val === "custom");
                    if (val !== "custom") {
                      setProducerCustomStart("");
                      setProducerCustomEnd("");
                    }
                  }}
                  style={{
                    background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 6,
                    color: "#94A3B8", fontSize: 12, padding: "4px 10px", cursor: "pointer",
                  }}
                >
                  <option value="main">Current Month</option>
                  <option value="ytd">Year to Date</option>
                  <option value="custom">Custom Range…</option>
                </select>
              </div>

              {/* Custom date range inputs — shown only when "Custom Range…" is selected */}
              {producerCustomOpen && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#64748B" }}>From</span>
                  <input
                    type="date"
                    value={producerCustomStart}
                    onChange={e => setProducerCustomStart(e.target.value)}
                    style={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 6, color: "#E2E8F0", fontSize: 12, padding: "4px 8px" }}
                  />
                  <span style={{ fontSize: 12, color: "#64748B" }}>to</span>
                  <input
                    type="date"
                    value={producerCustomEnd}
                    onChange={e => setProducerCustomEnd(e.target.value)}
                    style={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 6, color: "#E2E8F0", fontSize: 12, padding: "4px 8px" }}
                  />
                  {producerCustomStart && producerCustomEnd && (
                    <span style={{ fontSize: 11, color: "#64748B" }}>
                      {producerCustomStart} → {producerCustomEnd}
                    </span>
                  )}
                </div>
              )}

              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ minWidth: 580 }}>
                  <thead>
                    <tr>
                      <th>Producer</th>
                      <th>Policies</th>
                      <th>Items</th>
                      <th>Premium</th>
                      <th>Est. Commission</th>
                      <th>Blended Rate</th>
                      <th>Share</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProducer.map(p => {
                      const isMuted = p.name === "CCC" || p.name === "Unassigned";
                      return (
                        <tr key={p.name}>
                          <td style={{ minWidth: 160 }}>
                            <button
                              onClick={() => setProducerModal(p.name)}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: isMuted ? "#64748B" : "#F1F5F9",
                                fontWeight: 600, fontSize: 13, padding: 0,
                                fontFamily: "inherit", display: "block", textAlign: "left",
                                textDecoration: "underline", textDecorationColor: "transparent",
                                transition: "text-decoration-color 0.15s",
                                marginBottom: 5,
                              }}
                              onMouseEnter={e => e.target.style.textDecorationColor = "#3B82F6"}
                              onMouseLeave={e => e.target.style.textDecorationColor = "transparent"}
                            >
                              {p.name}
                            </button>
                            {/* Commission share bar */}
                            <div style={{ height: 3, borderRadius: 2, background: "#1E2130", width: "100%", maxWidth: 140 }}>
                              <div style={{
                                height: "100%",
                                borderRadius: 2,
                                width: `${(p.share * 100).toFixed(1)}%`,
                                background: isMuted ? "#334155" : "linear-gradient(90deg, #10B981, #3B82F6)",
                                transition: "width 0.4s ease",
                              }} />
                            </div>
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#E2E8F0" }}>{p.policies}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#E2E8F0" }}>{p.items}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#E2E8F0" }}>{fmtFull$(p.premium)}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#10B981" }}>{fmtFull$(p.commission)}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#94A3B8", fontSize: 12 }}>
                            {p.premium > 0 ? fmtPct(p.blendedRate) : "—"}
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#64748B", fontSize: 12 }}>
                            {(p.share * 100).toFixed(1)}%
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "#64748B" : "#E2E8F0" }}>{p.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
              <div style={{ minWidth: 120 }}>
                <label>Issued Date</label>
                <input type="date" value={newEntry.date} onChange={e => setNewEntry(p => ({...p, date: e.target.value}))} style={{ width: 140 }} title="Policy bind / issue date — not today's date" />
              </div>
              <div>
                <label>Policy No</label>
                <input type="text" placeholder="954061414" value={newEntry.policyNo} onChange={e => setNewEntry(p => ({...p, policyNo: e.target.value.trim()}))} style={{ width: 130 }} />
              </div>
              <div style={{ minWidth: 120 }}>
                <label>Product</label>
                <select value={newEntry.product} onChange={e => {
                  const val = e.target.value;
                  const locked = ["ho", "renters", "landlord", "pup", "manufactured"].includes(val);
                  setNewEntry(p => ({ ...p, product: val, itemCount: locked ? 1 : p.itemCount }));
                }}>
                  <option value="auto">Auto</option>
                  <option value="ho">Homeowners</option>
                  <option value="condo">Condo</option>
                  <option value="renters">Renters</option>
                  <option value="landlord">Landlord</option>
                  <option value="specialty_auto">Specialty Auto</option>
                  <option value="pup">Personal Umbrella</option>
                  <option value="manufactured">Manufactured Home</option>
                  <option value="boat">Boat Owners</option>
                  <option value="motor_club">Motor Club</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ minWidth: 120 }}>
                <label>Bundle Tier</label>
                <select value={newEntry.tier} onChange={e => setNewEntry(p => ({...p, tier: e.target.value}))}>
                  <option value="preferred">Preferred</option>
                  <option value="bundled">Bundled</option>
                  <option value="monoline">Monoline</option>
                </select>
              </div>
              <div>
                <label>Annual Premium ($)</label>
                <input type="number" placeholder="1200" value={newEntry.premium} onChange={e => setNewEntry(p => ({...p, premium: e.target.value}))} style={{ width: 120, minWidth: 100 }} />
              </div>
              <div>
                <label>Policies</label>
                <input type="number" value={newEntry.policyCount} min={1} onChange={e => setNewEntry(p => ({...p, policyCount: parseInt(e.target.value)||1}))} style={{ width: 70 }} />
              </div>
              {(() => {
                const isItemLocked = ["ho", "renters", "landlord", "pup", "manufactured"].includes(newEntry.product);
                return (
                  <div>
                    <label style={{ fontSize: 11, color: "#64748B" }}>Items</label>
                    <input
                      type="number"
                      min={1}
                      value={newEntry.itemCount}
                      disabled={isItemLocked}
                      onChange={e => setNewEntry(p => ({ ...p, itemCount: parseInt(e.target.value) || 1 }))}
                      style={{ width: 60, opacity: isItemLocked ? 0.5 : 1 }}
                      title={isItemLocked ? "Always 1 item for this product type" : "Number of vehicles or items"}
                    />
                  </div>
                );
              })()}
              <div style={{ flex: 1, minWidth: 120 }}>
                <label>Product</label>
                <input type="text" placeholder="Auto, Home, Renters..." value={newEntry.note} onChange={e => setNewEntry(p => ({...p, note: e.target.value}))} style={{ width: "100%" }} />
              </div>
              <button className="btn-primary" type="button" onClick={handleAddEntry} disabled={addingEntry}>{addingEntry ? "Adding…" : "Add"}</button>
            </div>
            {addEntryMsg && (
              <div style={{ marginTop: 10, fontSize: 12, color: addEntryMsg.startsWith("Unable") || addEntryMsg.startsWith("Enter") ? "#EF4444" : "#10B981" }}>
                {addEntryMsg}
              </div>
            )}
          </div>

          {/* Commission rate reminder — all three tiers */}
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setRatesOpen(!ratesOpen)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#94A3B8", cursor: "pointer", background: "none", border: "none", padding: "4px 0", width: "100%", textAlign: "left" }}
            >
              <ChevronRight style={{ width: 14, height: 14, transition: "transform 0.2s", transform: ratesOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
              Commission Rates Reference
            </button>
            {ratesOpen && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {Object.entries(COMMISSION).map(([key, val]) => (
                  <div key={key} style={{ background: "#1A1D27", border: `1px solid ${PRODUCT_COLORS[key]}33`, borderRadius: 6, padding: "6px 12px", fontSize: 11 }}>
                    <span style={{ color: PRODUCT_COLORS[key], fontWeight: 600, marginRight: 6 }}>{val.label}</span>
                    {Object.entries(TIER_LABELS).map(([tk, tl]) => (
                      <span key={tk} style={{ color: TIER_COLORS[tk], marginRight: 5 }}>{tl}: {fmtPct(val[tk])}</span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#334155", fontSize: 13 }}>No entries in this range. Add manually or upload an Allstate report.</div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <SortTh col="date"       label="Date"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="issuedDate" label="Issued Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="product"    label="Product"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="tier"       label="Tier"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="premium"    label="Premium"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="commission" label="Commission"  sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="source"     label="Source"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th>Product</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map(e => {
                  const tier = e.tier ?? "monoline";
                  return (
                    <tr key={e.id}>
                      <td style={{ color: "#64748B", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.date}</td>
                      <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.issuedDate}</td>
                      <td><span className="tag" style={{ background: `${PRODUCT_COLORS[e.product]}22`, color: PRODUCT_COLORS[e.product] }}>{PRODUCT_LABELS[e.product] ?? e.product}</span></td>
                      <td><span className="tag" style={{ background: `${TIER_COLORS[tier]}22`, color: TIER_COLORS[tier] }}>{TIER_LABELS[tier]}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(e.premium)}</td>
                      <td style={{ color: "#10B981", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(calcCommission(e.premium, e.product, tier))}</td>
                      <td><span className="tag" style={{ background: e.source==="upload" ? "#1E3A5F" : "#1E3348", color: e.source==="upload" ? "#60A5FA" : "#94A3B8" }}>{e.source}</span></td>
                      <td style={{ color: "#64748B", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</td>
                      <td><button className="del-btn" onClick={() => deleteEntry(e.id)} style={{ padding: 8, minWidth: 44, minHeight: 44, lineHeight: 1 }}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ color: "#64748B", fontWeight: 600, paddingTop: 12 }}>Total</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#F1F5F9", paddingTop: 12 }}>{fmtFull$(totals.totalPremium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#10B981", paddingTop: 12 }}>{fmtFull$(totals.totalCommission)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ── UPLOAD TAB ── */}
      {activeTab === "upload" && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: "#94A3B8", marginBottom: 4 }}>Upload Allstate Export</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 20 }}>
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>Commission Reference — New Business Rates by Tier</div>
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
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Total written premium · {rangeLabel}</div>
          <table>
            <thead><tr><th>Month</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {trendData.slice(-6).map(d => (
                <tr key={d.name}>
                  <td style={{ color: "#94A3B8" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(d.premium)}</td>
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
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"} · {rangeLabel}</div>
          <table>
            <thead><tr><th>Product</th><th>Premium</th><th>Commission</th><th>Eff. Rate</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.premium > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(val.premium)}</td>
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
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>Total policies · {rangeLabel} · Avg premium: {filtered.length > 0 ? fmtFull$(totals.totalPremium / filtered.reduce((s,e) => s + e.policyCount, 0)) : "—"}</div>
          <table>
            <thead><tr><th>Product</th><th>Policies</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.count > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{val.count}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(val.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — VC Baseline */}
      {modal === "kpi-vc-baseline" && (() => {
        const { vcBaselineCount } = policiesStats;
        const autoItems = filtered.reduce((s, e) => e.product === "auto" ? s + e.itemCount : s, 0);
        const hoItems   = filtered.reduce((s, e) => e.product === "ho"   ? s + e.itemCount : s, 0);
        const pct = Math.min(vcBaselineCount / VC_BASELINE_TARGET, 1);
        const onTrack = vcBaselineCount >= VC_BASELINE_TARGET;

        return (
          <DrillDownModal title="VC Baseline" onClose={closeModal}>
            {/* Total + progress bar */}
            <div style={{ fontSize: 42, fontWeight: 700, color: onTrack ? "#10B981" : "#F59E0B", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              {vcBaselineCount} <span style={{ fontSize: 20, color: "#64748B" }}>/ {VC_BASELINE_TARGET}</span>
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>
              Auto + HO items · {rangeLabel}
            </div>
            <div style={{ height: 8, background: "#252A3A", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ height: "100%", width: `${pct * 100}%`, background: onTrack ? "#10B981" : "#F59E0B", borderRadius: 4, transition: "width 0.4s" }} />
            </div>

            {/* Auto vs HO breakdown */}
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Policies</th>
                  <th>Items</th>
                  <th>Counts Toward VC</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span style={{ background: "#3B82F622", color: "#3B82F6", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Auto</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>
                    {filtered.filter(e => e.product === "auto").length}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0", fontWeight: 700 }}>{autoItems}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>✓</td>
                </tr>
                <tr>
                  <td><span style={{ background: "#10B98122", color: "#10B981", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>HO / Condo</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>
                    {filtered.filter(e => e.product === "ho").length}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0", fontWeight: 700 }}>{hoItems}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>✓</td>
                </tr>
                {/* Non-VC products for reference */}
                {["renters","landlord","specialty_auto","pup","manufactured","other"].map(key => {
                  const policies = filtered.filter(e => e.product === key);
                  if (policies.length === 0) return null;
                  const items = policies.reduce((s, e) => s + e.itemCount, 0);
                  const label = {
                    renters: "Renters", landlord: "Landlord", specialty_auto: "Specialty Auto",
                    pup: "Personal Umbrella", manufactured: "Manufactured Home", boat: "Boat Owners", other: "Other",
                  }[key];
                  return (
                    <tr key={key} style={{ opacity: 0.5 }}>
                      <td><span style={{ background: "#33415522", color: "#64748B", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{label}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{policies.length}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{items}</td>
                      <td style={{ color: "#334155" }}>—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!onTrack && (
              <div style={{ marginTop: 16, fontSize: 12, color: "#F59E0B", background: "#F59E0B11", borderRadius: 6, padding: "8px 12px" }}>
                {VC_BASELINE_TARGET - vcBaselineCount} more Auto/HO items needed to hit baseline
              </div>
            )}
          </DrillDownModal>
        );
      })()}

      {/* KPI — Portfolio Points */}
      {modal === "kpi-points" && (() => {
        const { totalPoints, priorPoints, pointsDelta } = policiesStats;

        // Build per-product breakdown
        const byProduct = {};
        filtered.forEach(e => {
          if (!byProduct[e.product]) byProduct[e.product] = { policies: 0, items: 0, points: 0 };
          byProduct[e.product].policies += e.policyCount;
          byProduct[e.product].items    += e.itemCount;
          byProduct[e.product].points   += (PORTFOLIO_POINTS[e.product] ?? 0) * e.itemCount;
        });

        const rows = Object.entries(byProduct)
          .filter(([, v]) => v.points > 0 || v.items > 0)
          .sort(([, a], [, b]) => b.points - a.points);


        return (
          <DrillDownModal title="Portfolio Points" onClose={closeModal}>
            {/* Total points + MoM */}
            <div style={{ fontSize: 42, fontWeight: 700, color: "#F1F5F9", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              {totalPoints}
            </div>
            <div style={{ fontSize: 13, color: pointsDelta >= 0 ? "#10B981" : "#EF4444", marginBottom: 24 }}>
              {pointsDelta >= 0 ? `+${pointsDelta}` : pointsDelta} pts vs prior month · {rangeLabel}
            </div>

            {/* Product breakdown table */}
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Policies</th>
                  <th>Items</th>
                  <th>Pts / Item</th>
                  <th>Total Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([key, val]) => (
                  <tr key={key}>
                    <td>
                      <span style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] ?? "#64748B", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {PRODUCT_LABELS[key] ?? key}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#94A3B8" }}>{val.policies}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{val.items}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{PORTFOLIO_POINTS[key] ?? 0}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#F1F5F9", fontWeight: 700 }}>{val.points}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: "1px solid #252A3A" }}>
                  <td style={{ color: "#F1F5F9", fontWeight: 600 }}>Total</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#94A3B8" }}>
                    {rows.reduce((s, [, v]) => s + v.policies, 0)}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>
                    {rows.reduce((s, [, v]) => s + v.items, 0)}
                  </td>
                  <td />
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981", fontWeight: 700 }}>{totalPoints}</td>
                </tr>
              </tbody>
            </table>

            {/* Prior month comparison */}
            {priorPoints > 0 && (
              <div style={{ marginTop: 16, fontSize: 12, color: "#64748B", borderTop: "1px solid #1A1D27", paddingTop: 12 }}>
                Prior month: <span style={{ fontFamily: "'DM Mono', monospace", color: "#94A3B8" }}>{priorPoints} pts</span>
                &nbsp;·&nbsp;
                Net: <span style={{ fontFamily: "'DM Mono', monospace", color: pointsDelta >= 0 ? "#10B981" : "#EF4444" }}>
                  {pointsDelta >= 0 ? `+${pointsDelta}` : pointsDelta}
                </span>
              </div>
            )}
          </DrillDownModal>
        );
      })()}

      {/* KPI — Commission Goal */}
      {modal === "kpi-goal" && (
        <DrillDownModal title={modalMode === "premium" ? "Written Premium Goal" : "Commission Revenue Goal"} onClose={closeModal}>
          {modalMode === "premium" ? (
            <>
              <div style={{ fontSize: 42, fontWeight: 700, color: "#3B82F6", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                {Math.round((totals.totalPremium / PREMIUM_GOAL) * 100)}%
              </div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
                {fmtFull$(totals.totalPremium)} written of {fmtFull$(PREMIUM_GOAL)} goal · {rangeLabel}
              </div>
              <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ height: "100%", width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`, background: "linear-gradient(90deg, #3B82F6, #8B5CF6)", borderRadius: 5 }} />
              </div>
              <table>
                <thead><tr><th>Month</th><th>Premium</th><th>Goal %</th></tr></thead>
                <tbody>
                  {trendData.slice(-6).map(d => (
                    <tr key={d.name}>
                      <td style={{ color: "#94A3B8" }}>{d.name}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(d.premium)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.premium >= PREMIUM_GOAL ? "#10B981" : "#64748B" }}>
                        {d.premium > 0 ? fmtPct(d.premium / PREMIUM_GOAL) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <div style={{ fontSize: 42, fontWeight: 700, color: commissionGoalPct >= 1 ? "#10B981" : "#F59E0B", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                {Math.round(commissionGoalPct * 100)}%
              </div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
                {fmtFull$(totals.totalCommission)} earned of {fmtFull$(COMMISSION_GOAL)} goal · {rangeLabel}
              </div>
              <div style={{ height: 10, background: "#252A3A", borderRadius: 5, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ height: "100%", width: `${Math.min(commissionGoalPct * 100, 100)}%`, background: commissionGoalPct >= 1 ? "#10B981" : "linear-gradient(90deg, #10B981, #3B82F6)", borderRadius: 5 }} />
              </div>
              <table>
                <thead><tr><th>Month</th><th>Commission</th><th>Goal %</th></tr></thead>
                <tbody>
                  {trendData.slice(-6).map(d => (
                    <tr key={d.name}>
                      <td style={{ color: "#94A3B8" }}>{d.name}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#E2E8F0" }}>{fmtFull$(d.commission)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "#10B981" : "#EF4444" }}>
                        {d.commission > 0 ? fmtPct(d.commission / COMMISSION_GOAL) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DrillDownModal>
      )}

      {/* Pace drill-down */}
      {modal === "pace" && pace && (
        <DrillDownModal
          title={modalMode === "commission" ? "Projected Commission" : "Projected Premium"}
          onClose={closeModal}
        >
          <div style={{ fontSize: 40, fontWeight: 700, color: modalMode === "commission" ? (pace.onPace ? "#10B981" : "#F59E0B") : "#3B82F6", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
            {modalMode === "commission" ? fmtFull$(pace.projectedCommission) : fmtFull$(pace.projectedPremium)}
          </div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
            {pace.onPace ? "↑ On pace" : "↓ Behind pace"} · Biz day {pace.elapsed}/{pace.totalDays} · projected by month-end
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Commission Earned",    value: fmtFull$(totals.totalCommission),   color: "#10B981" },
              { label: "Projected Commission", value: fmtFull$(pace.projectedCommission), color: pace.onPace ? "#10B981" : "#F59E0B" },
              { label: "Premium Written",      value: fmtFull$(totals.totalPremium),      color: "#E2E8F0" },
              { label: "Projected Premium",    value: fmtFull$(pace.projectedPremium),    color: "#3B82F6" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "#1A1D27", borderRadius: 10, padding: "14px 16px", border: "1px solid #252A3A" }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>
        </DrillDownModal>
      )}

      {/* Daily Target drill-down */}
      {modal === "daily" && dailyTarget && (() => {
        const dailyModes = {
          commission: { label: "DAILY TARGET",         value: fmtFull$(dailyTarget.dailyCommissionNeeded),          unit: "commission / day", color: "#F59E0B" },
          premium:    { label: "DAILY PREMIUM TARGET", value: fmtFull$(dailyTarget.dailyPremiumNeeded),             unit: "premium / day",    color: "#3B82F6" },
          policies:   { label: "POLICIES / DAY",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—", unit: "policies needed",  color: "#10B981" },
        };
        const active = dailyModes[modalMode] ?? dailyModes.commission;
        return (
          <DrillDownModal
            title={
              modalMode === "commission" ? "Daily Commission Target"
              : modalMode === "premium"  ? "Daily Premium Target"
              : "Daily Policies Target"
            }
            onClose={closeModal}
          >
            <div style={{ fontSize: 40, fontWeight: 700, color: active.color, fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              {active.value}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
              {active.unit} · {dailyTarget.remaining} business days left
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Commission Remaining", value: fmtFull$(dailyTarget.commissionRemaining), color: "#F59E0B" },
                { label: "Premium Remaining",    value: fmtFull$(dailyTarget.premiumRemaining),    color: "#3B82F6" },
                { label: "Daily Premium Needed", value: fmtFull$(dailyTarget.dailyPremiumNeeded),  color: "#E2E8F0" },
                { label: "Policies / Day",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—", color: "#10B981" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "#1A1D27", borderRadius: 10, padding: "14px 16px", border: "1px solid #252A3A" }}>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
                </div>
              ))}
            </div>
            {dailyTarget.avgCommissionPerPolicy && (
              <div style={{ fontSize: 12, color: "#334155", marginTop: 16 }}>
                Based on {dailyTarget.totalPolicies} policies · avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy
              </div>
            )}
          </DrillDownModal>
        );
      })()}

      {/* Trend chart drill-down */}
      {modal === "trend" && (
        <DrillDownModal title="Monthly Commission Earned vs $40K Goal" onClose={closeModal}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12, color: "#E2E8F0" }} itemStyle={{ color: "#E2E8F0" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: "$40K", fill: "#10B981", fontSize: 11 }} />
                <Bar dataKey="commission" radius={[4,4,0,0]}>
                  {trendData.map((entry, i) => (
                    <Cell key={i} fill={entry.commission >= COMMISSION_GOAL ? "#10B981" : "#3B82F6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DrillDownModal>
      )}

      {/* Product breakdown drill-down */}
      {modal === "products" && (() => {
        const VC_KEYS    = ["auto", "ho", "condo"];
        const NONVC_KEYS = ["renters", "motor_club", "landlord", "specialty_auto", "pup", "manufactured", "boat", "other"];

        const statsKeys = productStatsMode === "vc"
          ? VC_KEYS
          : productStatsMode === "nonvc"
          ? NONVC_KEYS
          : [...VC_KEYS, ...NONVC_KEYS];

        const statsPremium    = statsKeys.reduce((s, k) => s + (totals.byProduct[k]?.premium    ?? 0), 0);
        const statsCommission = statsKeys.reduce((s, k) => s + (totals.byProduct[k]?.commission ?? 0), 0);
        const statsItemCount  = statsKeys.reduce((s, k) => s + (totals.byProduct[k]?.itemCount  ?? 0), 0);
        const statsPolicyCount = statsKeys.reduce((s, k) => s + (totals.byProduct[k]?.count     ?? 0), 0);

        const statsBlendedRate         = statsPremium > 0 ? statsCommission / statsPremium : null;
        const statsPremiumShare        = totals.totalPremium > 0 ? statsPremium / totals.totalPremium : null;
        const statsCommissionShare     = totals.totalCommission > 0 ? statsCommission / totals.totalCommission : null;

        return (
        <DrillDownModal title="Revenue by Product Line" onClose={closeModal}>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[
              { key: "all",   label: "All Products" },
              { key: "vc",    label: "VC Only" },
              { key: "nonvc", label: "Non-VC Only" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setProductStatsMode(key)}
                className={`btn-ghost${productStatsMode === key ? " active" : ""}`}
                style={{ fontSize: 12, padding: "6px 14px" }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mode sub-label */}
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>
            {productStatsMode === "vc"    && "Auto + Homeowners + Condo"}
            {productStatsMode === "nonvc" && "Renters + Motor Club + Other"}
            {productStatsMode === "all"   && "All product lines"}
          </div>

          {/* Stats strip — 5 cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              {
                label: "BLENDED RATE",
                value: statsBlendedRate != null ? fmtPct(statsBlendedRate) : "—",
                sub: `${statsPolicyCount} policies · ${statsItemCount} items`,
                color: "#10B981",
              },
              {
                label: "TOTAL ITEMS",
                value: String(statsItemCount),
                sub: `${statsPolicyCount} policies`,
                color: "#3B82F6",
              },
              {
                label: "AVG COMMISSION / POLICY",
                value: statsPolicyCount > 0 ? fmtFull$(statsCommission / statsPolicyCount) : "—",
                sub: "commission ÷ policies",
                color: "#3B82F6",
              },
              {
                label: "PREMIUM",
                value: fmtFull$(statsPremium),
                sub: statsPremiumShare != null ? `${(statsPremiumShare * 100).toFixed(1)}% of total` : "—",
                color: "#F59E0B",
              },
              {
                label: "COMMISSION",
                value: fmtFull$(statsCommission),
                sub: statsCommissionShare != null ? `${(statsCommissionShare * 100).toFixed(1)}% of total` : "—",
                color: "#10B981",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 10, padding: "14px 18px", flex: "1 1 130px", minWidth: 120 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Product breakdown bars — unchanged */}
          <div style={{ marginBottom: 24 }}>
            <ProductBreakdownRows
              byProduct={totals.byProduct}
              totalPremium={totals.totalPremium}
              totalCommission={totals.totalCommission}
            />
          </div>

          {/* Product table — add % of Total, Items, Avg Premium columns */}
          <table style={{ marginTop: 24 }}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Premium</th>
                <th>% of Total</th>
                <th>Commission</th>
                <th>Eff. Rate</th>
                <th>Policies</th>
                <th>Items</th>
                <th>Avg Premium</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(totals.byProduct)
                .filter(([key, v]) => v.premium > 0 && statsKeys.includes(key))
                .sort(([, a], [, b]) => b.premium - a.premium)
                .map(([key, val]) => {
                  const pct = totals.totalPremium > 0 ? (val.premium / totals.totalPremium * 100).toFixed(1) : "—";
                  const avgPrem = val.count > 0 ? fmtFull$(val.premium / val.count) : "—";
                  return (
                    <tr key={key}>
                      <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(val.premium)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#94A3B8", fontWeight: 600 }}>{pct}%</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(val.commission)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{fmtPct(val.commission / val.premium)}</td>
                      <td style={{ color: "#E2E8F0" }}>{val.count}</td>
                      <td style={{ color: "#64748B" }}>{val.itemCount ?? val.count}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "#64748B" }}>{avgPrem}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

        </DrillDownModal>
        );
      })()}

      {/* Producer Drilldown Modal */}
      {producerModal != null && (() => {
        const producerRangeLabel = (() => {
          if (producerRange === "main") return "Current Month";
          if (producerRange === "ytd") return "Year to Date";
          if (producerRange === "custom" && producerCustomStart && producerCustomEnd)
            return `${producerCustomStart} → ${producerCustomEnd}`;
          return "Current Month";
        })();

        const producerEntries = producerFiltered
          .filter(e => (e.producerName || "Unassigned") === producerModal)
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        const producerTotals = producerEntries.reduce((acc, e) => {
          acc.policies   += 1;
          acc.items      += e.itemCount ?? 1;
          acc.premium    += e.premium ?? 0;
          acc.commission += calcCommission(e.premium ?? 0, e.product, e.tier ?? "monoline");
          acc.points     += (PORTFOLIO_POINTS[e.product] ?? 0) * (e.itemCount ?? 1);
          return acc;
        }, { policies: 0, items: 0, premium: 0, commission: 0, points: 0 });

        return (
          <DrillDownModal title={`${producerModal} — ${producerRangeLabel}`} onClose={() => setProducerModal(null)}>
            {/* Header summary strip */}
            <div style={{ display: "flex", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "Policies",        value: producerTotals.policies },
                { label: "Items",           value: producerTotals.items },
                { label: "Premium",         value: fmtFull$(producerTotals.premium) },
                { label: "Est. Commission", value: fmtFull$(producerTotals.commission), color: "#10B981" },
                { label: "Points",          value: producerTotals.points },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: color ?? "#F1F5F9" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* CCC context note */}
            {producerModal === "CCC" && (
              <p style={{ fontSize: 12, color: "#64748B", fontStyle: "italic", marginBottom: 16 }}>
                Policies bound via Allstate Call Center — not attributed to an agency producer.
              </p>
            )}

            {/* Policy detail table */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Tier</th>
                    <th>Policy No</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Premium</th>
                    <th>Est. Commission</th>
                    <th>Points</th>
                    <th>Issued Date</th>
                  </tr>
                </thead>
                <tbody>
                  {producerEntries.map(entry => {
                    const comm = calcCommission(entry.premium ?? 0, entry.product, entry.tier ?? "monoline");
                    const pts = (PORTFOLIO_POINTS[entry.product] ?? 0) * (entry.itemCount ?? 1);
                    const issuedFmt = entry.date ? new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—";
                    return (
                      <tr key={entry.id}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRODUCT_COLORS[entry.product] ?? "#64748B", flexShrink: 0 }} />
                            {PRODUCT_LABELS[entry.product] ?? entry.product}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            background: (TIER_COLORS[entry.tier] ?? "#64748B") + "22",
                            color: TIER_COLORS[entry.tier] ?? "#64748B",
                            borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600
                          }}>
                            {TIER_LABELS[entry.tier] ?? entry.tier ?? "—"}
                          </span>
                        </td>
                        <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{entry.policyNo || "—"}</td>
                        <td style={{ color: "#94A3B8", fontSize: 12 }}>{maskCustomerName(entry.customerName)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{entry.itemCount ?? 1}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{fmtFull$(entry.premium)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(comm)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "#E2E8F0" }}>{pts}</td>
                        <td style={{ color: "#94A3B8", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{issuedFmt}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ color: "#F1F5F9" }}>Total</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#F1F5F9" }}>{producerTotals.items}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#F1F5F9" }}>{fmtFull$(producerTotals.premium)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#10B981" }}>{fmtFull$(producerTotals.commission)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "#F1F5F9" }}>{producerTotals.points}</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </DrillDownModal>
        );
      })()}

    </>
  );
}
