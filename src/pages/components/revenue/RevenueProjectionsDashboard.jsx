import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useRevenueEntries } from "../../../hooks/useRevenueEntries";
import { useCurrentAgency } from "../../../hooks/useAgencyLeads";
import { useAgencyCarrierConfig } from "../../../hooks/useAgencies";
import { useAgencyProductConfig } from "../../../hooks/useAgencyProductConfig";
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

const DEFAULT_COMMISSION_GOAL = 40000;  // fallback when no DB config exists
const DEFAULT_PREMIUM_GOAL    = 160000; // fallback when no DB config exists
const PRODUCT_COLORS = {
  auto: "#3B82F6", ho: "#10B981", condo: "#34D399", renters: "#F59E0B", other: "#8B5CF6",
  landlord: "#06B6D4", specialty_auto: "#8B5CF6", pup: "#EC4899", manufactured: "#F97316", boat: "#0EA5E9", motor_club: "#F43F5E",
};
const PRODUCT_LABELS = {
  auto: "Auto", ho: "Homeowners", condo: "Condo", renters: "Renters", landlord: "Landlord",
  specialty_auto: "Specialty Auto", pup: "Personal Umbrella",
  manufactured: "Manufactured Home", boat: "Boat Owners", motor_club: "Motor Club", other: "Other",
};

// Portfolio points, VC eligibility, and baseline target are now sourced from
// useAgencyProductConfig — see hook call inside the component below.

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

// CAT reinsurance factors are now sourced from useAgencyProductConfig
// (cat_reinsurance_factors table by agency state, with agency_products override fallback).

/**
 * Compute commission for a single policy.
 *
 * @param {number}  premium     Written premium for the policy.
 * @param {string}  product     Product key (auto, ho, condo, ...).
 * @param {string}  tier        Bundle tier — 'preferred' | 'bundled' | 'monoline'.
 * @param {object}  catFactors  Commissionable reduction factors by product key.
 * @param {boolean} useVCRates  true → VC tiered rates (preferred/bundled/monoline);
 *                              false → flat base rate (Established Agency column).
 * @param {object}  baseRates   Flat base rates by product key (from agency_products.nb_rate_base).
 */
function calcCommission(
  premium,
  product,
  tier = "monoline",
  catFactors = {},
  useVCRates = true,
  baseRates = {},
) {
  const factor = catFactors[product] ?? 1.0;

  // Motor Club is a flat 25% regardless of VC baseline or toggle.
  if (product === "motor_club") {
    return premium * 0.25;
  }

  if (useVCRates) {
    const rates = COMMISSION[product] ?? COMMISSION.other;
    return premium * factor * (rates[tier] ?? rates.monoline);
  }

  const baseRate = baseRates[product] ?? 0.09;
  return premium * factor * baseRate;
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
    transaction_type: ["transaction type", "transaction"],
    disposition_code: ["disposition code", "disposition"],
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
  const iTransType   = findCol(headers, COL_MAP.transaction_type);
  const iDisposition = findCol(headers, COL_MAP.disposition_code);

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
      const d = rawIssued instanceof Date ? rawIssued : new Date(rawIssued);
      if (!isNaN(d.getTime())) issuedDateStr = d.toISOString().slice(0, 10);
    }
    if (rawWritten) {
      const d = rawWritten instanceof Date ? rawWritten : new Date(rawWritten);
      if (!isNaN(d.getTime())) writtenDateStr = d.toISOString().slice(0, 10);
    }

    // Transaction Type + Disposition Code filtering — authoritative when present.
    // Rules:
    //   • Drop ALL endorsements (no endorsement premium counts as NB, regardless of date/term).
    //   • Drop Sales Issued / Add Item (vehicle adds to existing policies).
    //   • Keep Sales Issued / New Policy Issued (new Motor Club policies — commission only, not VC).
    //   • Keep New Issued Transaction rows (genuine new business).
    //   • Fallback to date-diff heuristic only when Transaction Type column is absent.
    const transType   = (iTransType   >= 0 ? r[iTransType]?.toString().trim()   : "") || "";
    const disposition = (iDisposition >= 0 ? r[iDisposition]?.toString().trim() : "") || "";

    const transLower = transType.toLowerCase();
    const dispLower  = disposition.toLowerCase();

    const isNewIssued   = transLower.includes("new issued transaction");
    const isEndorsement = transLower.includes("endorsement");
    const isSalesIssued = transLower.startsWith("sales issued");
    const isAddItem     = dispLower === "add item";
    const isNewPolicy   = dispLower === "new policy issued";

    if (transType) {
      // Transaction Type column is present — use it authoritatively.

      // Drop ALL endorsements — no endorsement premium counts as new business
      // under any circumstance regardless of date, term, or what was added.
      if (isEndorsement) return null;

      // Drop Sales Issued / Add Item — vehicle adds to existing policies
      if (isSalesIssued && isAddItem) return null;

      // Drop any other Sales Issued variants that aren't New Policy Issued
      if (isSalesIssued && !isNewPolicy) return null;

      // Drop anything that isn't New Issued or the kept Sales Issued / New Policy Issued
      if (!isNewIssued && !(isSalesIssued && isNewPolicy)) return null;
    } else {
      // Fallback: no Transaction Type column (older report format).
      // Keep existing date-diff logic as the only available signal.
      if (writtenDateStr && writtenDateStr !== issuedDateStr) return null;
    }

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
        <span style={{ fontSize: 9, color: active ? "var(--qs-text)" : "var(--qs-muted)", lineHeight: 1 }}>
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
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--qs-card)", border: "1px solid var(--qs-border)", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: "98vw", height: "96vh", overflow: "hidden", padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px 16px", borderBottom: "1px solid var(--qs-border)", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--qs-bright)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--qs-subtle)", fontSize: 20, cursor: "pointer", minWidth: 44, minHeight: 44 }}>×</button>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--qs-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", paddingRight: 4 }}>
        <span>Product</span>
        <span style={{ display: "flex", gap: 16 }}>
          <span style={{ width: 72, textAlign: "right" }}>Premium</span>
          <span style={{ width: 44, textAlign: "right" }}>% Mix</span>
          <span style={{ width: 72, textAlign: "right" }}>Commission</span>
          <span style={{ width: 52, textAlign: "right" }}>Rate</span>
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
                <span style={{ fontSize: 12, color: "var(--qs-dim)", fontWeight: 500 }}>{COMMISSION[key].label}</span>
              </span>
              <span style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                <span style={{ width: 72, textAlign: "right", color: "var(--qs-text)" }}>{fmtFull$(val.premium)}</span>
                <span style={{ width: 44, textAlign: "right", color: "var(--qs-dim)", fontWeight: 600 }}>{(premiumPct * 100).toFixed(1)}%</span>
                <span style={{ width: 72, textAlign: "right", color: "var(--qs-success)" }}>{fmtFull$(val.commission)}</span>
                <span style={{ width: 52, textAlign: "right", color: "var(--qs-subtle)" }}>{fmtPct(effRate)}</span>
                <span style={{ width: 44, textAlign: "right", color: "var(--qs-subtle)" }}>{val.count}</span>
              </span>
            </div>
            <div style={{ height: 7, background: "var(--qs-border)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${premiumPct * 100}%`, background: `${PRODUCT_COLORS[key]}33`, borderRadius: 4 }} />
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${commPct * 100}%`, background: PRODUCT_COLORS[key], borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--qs-muted)", marginTop: 2 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 3, background: "#3B82F633", borderRadius: 2, display: "inline-block" }} />
          Premium share
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 20, height: 3, background: "var(--qs-info)", borderRadius: 2, display: "inline-block" }} />
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
  const { data: carrierConfig } = useAgencyCarrierConfig(agencyId);
  const { config: productConfig } = useAgencyProductConfig(agencyId);
  const COMMISSION_GOAL = carrierConfig?.commission_goal ? Number(carrierConfig.commission_goal) : DEFAULT_COMMISSION_GOAL;
  const PREMIUM_GOAL = carrierConfig?.premium_goal ? Number(carrierConfig.premium_goal) : DEFAULT_PREMIUM_GOAL;
  const PORTFOLIO_POINTS   = productConfig.portfolioPoints;
  const VC_ITEM_PRODUCTS   = productConfig.vcEligibleKeys;
  const VC_BASELINE_TARGET = productConfig.vcBaselineTarget;
  const COMMISSIONABLE_FACTORS = productConfig.commissionableFactors;
  const BASE_RATES             = productConfig.baseRates ?? {};
  const isExcludedLine = (product) =>
    product !== 'motor_club' &&
    product !== 'other' &&
    !VC_ITEM_PRODUCTS.includes(product);
  const [newEntry, setNewEntry] = useState(emptyEntry());
  // Commission rate regime toggle — default VC (principal optimistically tracks
  // toward baseline). Switch to "base" to see guaranteed floor commission.
  const [commissionView, setCommissionView] = useState("vc"); // 'vc' | 'base'
  const showingVCRates = commissionView === "vc";
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
  const [productStatsMode, setProductStatsMode] = useState("all"); // "all" | "vc" | "core" | "auto"
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
  const selectedYear = TODAY.getFullYear();
  const { data: allYearEntries = [] } = useQuery({
    queryKey: ["revenue_entries", agencyId, `${selectedYear}-01-01`, `${selectedYear}-12-31`],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_entries")
        .select("*")
        .eq("agency_id", agencyId)
        .gte("issued_date", `${selectedYear}-01-01`)
        .lte("issued_date", `${selectedYear}-12-31`)
        .order("issued_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => ({
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
      }));
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // ─── Filtered entries ──────────────────────────────────────────────────────
  // Compare as YYYY-MM-DD strings (local timezone) to avoid UTC parsing bugs.
  // `new Date("2026-04-01")` parses as UTC midnight, but `rangeStart` is built
  // with the local-timezone constructor — so in timezones west of UTC, entries
  // dated the first of the month were silently excluded from the filter.
  const rangeStartStr = useMemo(() => rangeStart.toLocaleDateString('en-CA'), [rangeStart]);
  const rangeEndStr   = useMemo(() => rangeEnd.toLocaleDateString('en-CA'),   [rangeEnd]);

  const filtered = useMemo(() =>
    entries.filter(e => e.date >= rangeStartStr && e.date <= rangeEndStr),
    [entries, rangeStartStr, rangeEndStr]);

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
          av = calcCommission(a.premium, a.product, a.tier, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
          bv = calcCommission(b.premium, b.product, b.tier, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
          break;
        case "source":     av = a.source;     bv = b.source;     break;
        default:           av = a.date;       bv = b.date;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortCol, sortDir, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES]);

  // ─── Aggregated totals ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const base = { premium: 0, commission: 0, count: 0, itemCount: 0 };
    const byProduct = {
      auto: {...base}, ho: {...base}, condo: {...base}, renters: {...base},
      landlord: {...base}, specialty_auto: {...base}, pup: {...base},
      manufactured: {...base}, boat: {...base}, motor_club: {...base}, other: {...base},
    };
    filtered.forEach(e => {
      const c = calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
      const p = byProduct[e.product] ?? byProduct.other;
      p.premium += e.premium;
      p.commission += c;
      p.count += e.policyCount;
      p.itemCount += e.itemCount ?? 1;
    });
    const totalPremium = Object.values(byProduct).reduce((s, v) => s + v.premium, 0);
    const totalCommission = Object.values(byProduct).reduce((s, v) => s + v.commission, 0);

    // VC bonus delta — always computed regardless of current view. This is the
    // dollar amount at stake if the VC baseline isn't hit by month-end.
    let commissionAtVC = 0;
    let commissionAtBase = 0;
    filtered.forEach(e => {
      commissionAtVC   += calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, true,  BASE_RATES);
      commissionAtBase += calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, false, BASE_RATES);
    });
    const vcBonusDelta = commissionAtVC - commissionAtBase;

    return { byProduct, totalPremium, totalCommission, commissionAtVC, commissionAtBase, vcBonusDelta };
  }, [filtered, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES]);

  // ─── Policies stats (items, VC baseline, portfolio points) ───────────────
  const policiesStats = useMemo(() => {
    const totalPolicies = filtered.reduce((s, e) => s + e.policyCount, 0);

    // VC Baseline = all VC-eligible product items
    const vcBaselineCount = filtered.reduce((s, e) => {
      if (VC_ITEM_PRODUCTS.includes(e.product)) return s + e.itemCount;
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
      map[name].commission += calcCommission(e.premium ?? 0, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
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
  }, [producerFiltered, COMMISSIONABLE_FACTORS, PORTFOLIO_POINTS, showingVCRates, BASE_RATES]);

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
      const commission = slice.reduce((s, e) => s + calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES), 0);
      return { name: `${MONTH_NAMES[month]} '${String(year).slice(2)}`, premium, commission, goal: COMMISSION_GOAL };
    });
  }, [entries, COMMISSIONABLE_FACTORS, COMMISSION_GOAL, showingVCRates, BASE_RATES]);

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
      barColor: commissionGoalPct >= 1 ? "var(--qs-success)" : "linear-gradient(90deg, var(--qs-success), var(--qs-info))",
      valueColor: commissionGoalPct >= 1 ? "var(--qs-success)" : "var(--qs-warning)",
    },
    premium: {
      label: "PREMIUM GOAL",
      pct: Math.min(totals.totalPremium / PREMIUM_GOAL, 1),
      earned: totals.totalPremium,
      goal: PREMIUM_GOAL,
      barColor: "linear-gradient(90deg, var(--qs-info), var(--qs-purple))",
      valueColor: "var(--qs-info)",
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
      .reduce((s, e) => s + calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES), 0);
  }, [entries, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES]);

  // ─── Daily cumulative commission (month view only) ──────────────────────
  const dailyCumulative = useMemo(() => {
    if (view !== "month") return [];

    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const todayDay = today.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Group entries by day
    const byDay = {};
    entries.forEach(e => {
      const [ey, em, ed] = e.date.split('-').map(Number);
      if (ey === y && em - 1 === m) {
        const day = ed;
        if (!byDay[day]) byDay[day] = 0;
        byDay[day] += calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
      }
    });

    // Build cumulative array up to today
    let running = 0;
    return Array.from({ length: todayDay }, (_, i) => {
      const day = i + 1;
      running += byDay[day] ?? 0;
      const idealPace = (COMMISSION_GOAL / daysInMonth) * day;
      return {
        day,
        cumulative: running,
        idealPace,
        isYesterday: day === todayDay - 1,
        isToday: day === todayDay,
        dailyEarned: byDay[day] ?? 0,
      };
    });
  }, [view, entries, COMMISSION_GOAL, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES]);

  const yesterdayEarned = dailyCumulative.find(d => d.isYesterday)?.dailyEarned ?? 0;
  const todayEarned = dailyCumulative.find(d => d.isToday)?.dailyEarned ?? 0;
  const mtdCommission = totals.totalCommission;
  const mtdGap = COMMISSION_GOAL - mtdCommission;
  const mtdAhead = mtdCommission > (dailyCumulative.at(-1)?.idealPace ?? 0);

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
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames.find(n => n.toLowerCase() !== "filters") ?? wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
      const parsed = parseAllstateRows(rows);
      if (parsed.length === 0) {
        setUploadMsg("⚠️ No rows parsed — check column headers match Allstate export format.");
      } else {
        // Build bind ID → employee name map + employee UUID map from employee_producer_codes
        let employeeBindMap = new Map();
        let employeeIdMap = new Map();
        if (agencyId) {
          const { data: codeData } = await supabase
            .from("employee_producer_codes")
            .select("code, employee_id, employees(first_name, last_name, preferred_name)")
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
          employeeIdMap = new Map(
            (codeData ?? []).map(row => [row.code, row.employee_id])
          );
        }
        const { count, error } = await addEntries(parsed, employeeBindMap, employeeIdMap);
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
      // Generate AI brief first
      let advisoryBrief = "";
      try {
        const briefPayload = {
          totalCommission: totals.totalCommission,
          goal: COMMISSION_GOAL,
          goalPct: commissionGoalPct,
          projectedCommission: pace?.projectedCommission ?? null,
          onPace: pace?.onPace ?? null,
          dailyNeeded: dailyTarget?.dailyCommissionNeeded ?? null,
          daysRemaining: dailyTarget?.remaining ?? null,
          vcBaseline: policiesStats.vcBaselineCount,
          vcBaselineTarget: VC_BASELINE_TARGET,
          totalPolicies: policiesStats.totalPolicies,
          blendedRate: totals.totalPremium > 0 ? totals.totalCommission / totals.totalPremium : 0,
          momDelta: totals.totalCommission - lastMonthCommission,
          yesterdayEarned,
          rangeLabel,
        };

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 400,
            system: `You are a business intelligence advisor for an Allstate insurance agency in Georgia. Write a concise 3-5 sentence advisory brief for the agency principal based on their revenue KPIs. Be direct and actionable. Use dollar amounts and percentages from the data. Do not use bullet points — write in prose. Flag risks if behind pace. Celebrate wins if ahead. End with one specific recommended action for the next 3 business days.`,
            messages: [{
              role: "user",
              content: `Generate an advisory brief for this period: ${briefPayload.rangeLabel}\n\nKPIs:\n- Commission earned: $${Math.round(briefPayload.totalCommission).toLocaleString()} of $${COMMISSION_GOAL.toLocaleString()} goal (${Math.round(briefPayload.goalPct * 100)}%)\n- Projected month-end: $${briefPayload.projectedCommission ? Math.round(briefPayload.projectedCommission).toLocaleString() : "N/A"}\n- On pace: ${briefPayload.onPace ? "Yes" : "No"}\n- Daily commission needed: $${briefPayload.dailyNeeded ? Math.round(briefPayload.dailyNeeded).toLocaleString() : "N/A"} with ${briefPayload.daysRemaining ?? "N/A"} business days remaining\n- VC Baseline items: ${briefPayload.vcBaseline} of ${VC_BASELINE_TARGET} target\n- Total policies: ${briefPayload.totalPolicies}\n- Blended commission rate: ${(briefPayload.blendedRate * 100).toFixed(1)}%\n- Month-over-month change: $${Math.round(Math.abs(briefPayload.momDelta)).toLocaleString()} ${briefPayload.momDelta >= 0 ? "increase" : "decrease"}\n- Yesterday's commission: $${Math.round(briefPayload.yesterdayEarned).toLocaleString()}`
            }]
          })
        });

        const data = await response.json();
        advisoryBrief = data.content?.[0]?.text ?? "";
      } catch (briefErr) {
        console.warn("Advisory brief generation failed:", briefErr);
        advisoryBrief = ""; // PDF generates without brief if API fails
      }

      // Build pace object with daily target fields for PDF
      const paceForPdf = pace ? {
        ...pace,
        dailyCommissionNeeded: dailyTarget?.dailyCommissionNeeded ?? 0,
        remaining: dailyTarget?.remaining ?? 0,
      } : null;

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
          pace={paceForPdf}
          policiesStats={policiesStats}
          dailyCumulative={dailyCumulative}
          yesterdayEarned={yesterdayEarned}
          byProducer={byProducer}
          lastMonthCommission={lastMonthCommission}
          advisoryBrief={advisoryBrief}
          commissionGoal={COMMISSION_GOAL}
          vcBaselineTarget={VC_BASELINE_TARGET}
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
      calcCommission(e.premium, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES).toFixed(2),
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
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "var(--qs-text)" }}>


      {error && (
        <div style={{ background: "#2D1A1A", border: "1px solid var(--qs-danger)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--qs-danger)" }}>
          {error}
        </div>
      )}
      {loading && (
        <div style={{ color: "var(--qs-subtle)", fontSize: 13, marginBottom: 12 }}>Loading entries...</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--qs-info)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>insuredbycam.com</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--qs-bright)" }}>Revenue Projections</h1>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginTop: 2 }}>New Business · Commission Goal: {fmtFull$(COMMISSION_GOAL)}/mo</div>
        </div>
        {/* View selector + commission rate toggle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
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
                    background: "#1E293B", border: "1px solid var(--qs-muted)", borderRadius: 6,
                    color: "var(--qs-bright)", fontSize: 13, padding: "4px 8px", cursor: "pointer"
                  }}
                />
                <span style={{ color: "var(--qs-subtle)", fontSize: 12 }}>to</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={e => setCustomEnd(e.target.value)}
                  style={{
                    background: "#1E293B", border: "1px solid var(--qs-muted)", borderRadius: 6,
                    color: "var(--qs-bright)", fontSize: 13, padding: "4px 8px", cursor: "pointer"
                  }}
                />
              </div>
            )}

            {/* Commission Rate Toggle — base vs VC regime */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--qs-elevated)", borderRadius: 8,
              padding: "4px", border: "1px solid var(--qs-border)",
              marginLeft: 4,
            }}>
              <button
                onClick={() => setCommissionView("base")}
                style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 12,
                  fontWeight: 600, cursor: "pointer", border: "none",
                  background: !showingVCRates ? "var(--qs-card)" : "transparent",
                  color: !showingVCRates ? "var(--qs-bright)" : "var(--qs-muted)",
                  boxShadow: !showingVCRates ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                Base (9%)
              </button>
              <button
                onClick={() => setCommissionView("vc")}
                style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 12,
                  fontWeight: 600, cursor: "pointer", border: "none",
                  background: showingVCRates ? "var(--qs-card)" : "transparent",
                  color: showingVCRates ? "#10B981" : "var(--qs-muted)",
                  boxShadow: showingVCRates ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                VC Rate
              </button>
            </div>
          </div>
          <p style={{ fontSize: 10, color: "var(--qs-muted)", margin: 0, textAlign: "right" }}>
            {showingVCRates
              ? "Showing VC rates — assumes baseline met"
              : "Showing base rates — guaranteed commission"}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {/* Written Premium */}
        <div className="card clickable" onClick={() => setModal("kpi-written")}>
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Written Premium</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--qs-bright)", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalPremium)}</div>
          <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>{rangeLabel}</div>
        </div>
        {/* Commission Earned */}
        <div className="card clickable" onClick={() => setModal("kpi-commission")}>
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Commission Earned</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--qs-success)", fontFamily: "'DM Mono', monospace" }}>{fmt$(totals.totalCommission)}</div>
          <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"}</div>
          {view === "month" && lastMonthCommission > 0 && (() => {
            const delta = totals.totalCommission - lastMonthCommission;
            const pct   = Math.abs(delta / lastMonthCommission * 100).toFixed(1);
            return (
              <div style={{ fontSize: 12, color: delta >= 0 ? "var(--qs-success)" : "var(--qs-danger)", marginTop: 4 }}>
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
              subColor: "var(--qs-subtle)",
            },
            ...(view !== "ytd" ? {
              items: {
                label: "VC BASELINE",
                value: String(vcBaselineCount),
                sub: vcOnTrack
                  ? `✓ ${vcBaselineCount} / ${VC_BASELINE_TARGET} (${productConfig.vcProgramLabel})`
                  : `${vcBaselineCount} / ${VC_BASELINE_TARGET} · ${vcShortfall} needed`,
                subColor: vcOnTrack ? "var(--qs-success)" : "var(--qs-warning)",
              },
            } : {
              items: {
                label: "ITEMS WRITTEN",
                value: String(filtered.reduce((s, e) => s + (e.itemCount ?? 1), 0)),
                sub: "Total items YTD",
                subColor: "var(--qs-subtle)",
              },
            }),
            points: {
              label: "PORTFOLIO POINTS",
              value: String(totalPoints),
              sub: view !== "ytd"
                ? (pointsDelta >= 0 ? `+${pointsDelta} vs last month` : `${pointsDelta} vs last month`)
                : "Portfolio points YTD",
              subColor: view !== "ytd"
                ? (pointsDelta >= 0 ? "var(--qs-success)" : "var(--qs-danger)")
                : "var(--qs-subtle)",
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
              <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                {active.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "var(--qs-bright)", fontFamily: "'DM Mono', monospace" }}>
                {active.value}
              </div>
              <div style={{ fontSize: 12, color: active.subColor, marginTop: 2 }}>
                {active.sub}
              </div>
              {/* Mode indicator dots */}
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["count", "items", "points"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: policiesMode === m ? "var(--qs-text)" : "var(--qs-muted)", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}
        {/* Commission Goal / YTD Commission */}
        <div className="card clickable" style={{ position: "relative", overflow: "hidden" }} onClick={handleGoalClick} title="Click to switch · Double-click to expand">
          <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            {view !== "ytd" ? activeGoal.label : "YTD COMMISSION"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: view === "ytd" ? "var(--qs-success)" : activeGoal.valueColor, fontFamily: "'DM Mono', monospace" }}>
            {view !== "ytd" ? fmtFull$(activeGoal.earned) : fmtFull$(totals.totalCommission)}
          </div>
          {view !== "ytd" ? (
            <>
              <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>
                {Math.round(activeGoal.pct * 100)}% of {fmtFull$(activeGoal.goal)} goal
              </div>
              <div style={{ height: 3, background: "var(--qs-border)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(activeGoal.pct * 100, 100)}%`, background: activeGoal.barColor, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: goalMode === m ? "var(--qs-text)" : "var(--qs-muted)", transition: "background 0.2s" }} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>
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
              color: pace.onPace ? "var(--qs-success)" : pace.projectedCommission < COMMISSION_GOAL * 0.5 ? "var(--qs-danger)" : "var(--qs-warning)",
            },
            premium: {
              label: "PROJECTED PREMIUM",
              value: fmt$(pace.projectedPremium),
              subLabel: "projected by month-end",
              color: "var(--qs-info)",
            },
          };
          const activePace = paceModeConfig[paceMode];
          return (
            <div className="card clickable" onClick={handlePaceClick} title="Click to switch · Double-click to expand">
              <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{activePace.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: activePace.color, fontFamily: "'DM Mono', monospace" }}>{activePace.value}</div>
              <div style={{ fontSize: 12, color: activePace.color, marginTop: 2 }}>{pace.onPace ? "↑ On pace" : "↓ Behind pace"} · {dailyTarget.remaining} business days left</div>
              <div style={{ fontSize: 10, color: "var(--qs-muted)", marginTop: 4 }}>{activePace.subLabel}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: paceMode === m ? "var(--qs-text)" : "var(--qs-muted)", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}
        {dailyTarget && (() => {
          const dailyModes = {
            commission: { label: "DAILY TARGET",         value: fmtFull$(dailyTarget.dailyCommissionNeeded),            unit: "commission / day", color: "var(--qs-warning)" },
            premium:    { label: "DAILY PREMIUM TARGET", value: fmtFull$(dailyTarget.dailyPremiumNeeded),               unit: "premium / day",    color: "var(--qs-info)" },
            policies:   { label: "POLICIES / DAY",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—",   unit: "policies needed",  color: "var(--qs-success)" },
          };
          const activeDaily = dailyModes[dailyTargetMode];
          return (
            <div className="card clickable" onClick={handleDailyClick} title="Click to switch · Double-click to expand">
              <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{activeDaily.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: activeDaily.color, fontFamily: "'DM Mono', monospace" }}>{activeDaily.value}</div>
              <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginTop: 2 }}>{activeDaily.unit} · {dailyTarget.remaining} business days left</div>
              <div style={{ borderTop: "1px solid var(--qs-border)", marginTop: 10, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {Object.entries(dailyModes)
                  .filter(([key]) => key !== dailyTargetMode)
                  .map(([key, m]) => (
                    <div key={key} style={{ fontSize: 11, color: "var(--qs-subtle)" }}>
                      <span style={{ color: m.color, fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{m.value}</span>
                      {" "}{m.unit}
                    </div>
                  ))
                }
              </div>
              {dailyTarget.avgCommissionPerPolicy && (
                <div style={{ fontSize: 10, color: "var(--qs-muted)", marginTop: 6 }}>
                  Avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy
                </div>
              )}
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {["commission", "premium", "policies"].map(m => (
                  <div key={m} style={{ width: 5, height: 5, borderRadius: "50%", background: dailyTargetMode === m ? "var(--qs-text)" : "var(--qs-muted)", transition: "background 0.2s" }} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* VC Bonus at Stake — always shown, regardless of toggle */}
        {(() => {
          const baselineMet = policiesStats.vcBaselineCount >= VC_BASELINE_TARGET;
          return (
            <div style={{
              padding: "16px 20px", borderRadius: 10,
              background: baselineMet ? "#10B98111" : "#F59E0B11",
              border: `1px solid ${baselineMet ? "#10B98133" : "#F59E0B33"}`,
            }}>
              <div style={{ fontSize: 11, color: "var(--qs-subtle)", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                VC Bonus at Stake
              </div>
              <div style={{ fontSize: 26, fontWeight: 700,
                color: baselineMet ? "var(--qs-success)" : "var(--qs-warning)",
                fontFamily: "'DM Mono', monospace" }}>
                +{fmtFull$(totals.vcBonusDelta)}
              </div>
              <div style={{ fontSize: 12, marginTop: 2,
                color: baselineMet ? "var(--qs-success)" : "var(--qs-warning)",
                fontWeight: 500 }}>
                {baselineMet
                  ? "✓ Baseline met — VC rates active"
                  : `${VC_BASELINE_TARGET - policiesStats.vcBaselineCount} items needed to unlock`}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Daily Cumulative Earnings Chart moved to dedicated DailyEarningsTab */}

      {/* Goal Tracking (month only) */}
      {view === "month" && <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        {/* Commission Goal — primary */}
        <div style={{ marginBottom: 16, cursor: "pointer" }} onClick={() => setModal("commission")}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "var(--qs-dim)", fontWeight: 600 }}>Commission Revenue Goal</span>
            <span style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>
              {fmtFull$(totals.totalCommission)} / {fmtFull$(COMMISSION_GOAL)}
            </span>
          </div>
          <div style={{ height: 10, background: "var(--qs-border)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(totals.totalCommission / COMMISSION_GOAL * 100, 100)}%`,
              background: totals.totalCommission >= COMMISSION_GOAL ? "var(--qs-success)" : "linear-gradient(90deg, var(--qs-success), var(--qs-info))",
              borderRadius: 5,
              transition: "width 0.5s",
            }} />
          </div>
        </div>
        {/* Written Premium Volume — secondary */}
        <div style={{ cursor: "pointer" }} onClick={() => setModal("premium")}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "var(--qs-dim)", fontWeight: 600 }}>Written Premium Volume</span>
            <span style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>
              {fmtFull$(totals.totalPremium)} / {fmtFull$(PREMIUM_GOAL)}
            </span>
          </div>
          <div style={{ height: 10, background: "var(--qs-border)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`,
              background: "linear-gradient(90deg, var(--qs-info), var(--qs-purple))",
              borderRadius: 5,
              transition: "width 0.5s",
            }} />
          </div>
          {/* Product breakdown dots */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", color: "var(--qs-dim)" }}>
            {Object.entries(totals.byProduct).map(([key, val]) => val.premium > 0 && (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: PRODUCT_COLORS[key] }} />
                <span style={{ color: "var(--qs-subtle)" }}>{COMMISSION[key].label}</span>
                <span style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>{fmt$(val.premium)}</span>
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-dim)", marginBottom: 16 }}>Monthly Commission Earned vs {fmt$(COMMISSION_GOAL)} Goal</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12, color: "#E2E8F0" }} labelStyle={{ color: "#94A3B8" }} itemStyle={{ color: "#E2E8F0" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: fmt$(COMMISSION_GOAL), fill: "#10B981", fontSize: 11 }} />
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-dim)", marginBottom: 16 }}>Revenue by Product Line</div>
            {totals.totalPremium === 0 ? (
              <div style={{ color: "var(--qs-muted)", textAlign: "center", padding: "30px 0", fontSize: 13 }}>No data in range</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-dim)" }}>Producer Breakdown</div>

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
                    background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 6,
                    color: "var(--qs-dim)", fontSize: 12, padding: "4px 10px", cursor: "pointer",
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
                  <span style={{ fontSize: 12, color: "var(--qs-subtle)" }}>From</span>
                  <input
                    type="date"
                    value={producerCustomStart}
                    onChange={e => setProducerCustomStart(e.target.value)}
                    style={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 6, color: "var(--qs-text)", fontSize: 12, padding: "4px 8px" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--qs-subtle)" }}>to</span>
                  <input
                    type="date"
                    value={producerCustomEnd}
                    onChange={e => setProducerCustomEnd(e.target.value)}
                    style={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 6, color: "var(--qs-text)", fontSize: 12, padding: "4px 8px" }}
                  />
                  {producerCustomStart && producerCustomEnd && (
                    <span style={{ fontSize: 11, color: "var(--qs-subtle)" }}>
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
                                color: isMuted ? "var(--qs-subtle)" : "var(--qs-bright)",
                                fontWeight: 600, fontSize: 13, padding: 0,
                                fontFamily: "inherit", display: "block", textAlign: "left",
                                textDecoration: "underline", textDecorationColor: "transparent",
                                transition: "text-decoration-color 0.15s",
                                marginBottom: 5,
                              }}
                              onMouseEnter={e => e.target.style.textDecorationColor = "var(--qs-info)"}
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
                                background: isMuted ? "var(--qs-muted)" : "linear-gradient(90deg, var(--qs-success), var(--qs-info))",
                                transition: "width 0.4s ease",
                              }} />
                            </div>
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-text)" }}>{p.policies}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-text)" }}>{p.items}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-text)" }}>{fmtFull$(p.premium)}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-success)" }}>{fmtFull$(p.commission)}</td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-dim)", fontSize: 12 }}>
                            {p.premium > 0 ? fmtPct(p.blendedRate) : "—"}
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-subtle)", fontSize: 12 }}>
                            {(p.share * 100).toFixed(1)}%
                          </td>
                          <td style={{ fontFamily: "'DM Mono', monospace", color: isMuted ? "var(--qs-subtle)" : "var(--qs-text)" }}>{p.points}</td>
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
          <div style={{ marginBottom: 20, padding: 16, background: "var(--qs-elevated)", borderRadius: 10, border: "1px solid var(--qs-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-dim)" }}>Add Manual Entry</div>
              {filtered.length > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-ghost" onClick={exportCSV}>Export CSV</button>
                  <button className="btn-ghost" onClick={exportPDF} disabled={pdfGenerating}>
                    {pdfGenerating ? "Generating…" : "Export Report"}
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
                    <label style={{ fontSize: 11, color: "var(--qs-subtle)" }}>Items</label>
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
              <div style={{ marginTop: 10, fontSize: 12, color: addEntryMsg.startsWith("Unable") || addEntryMsg.startsWith("Enter") ? "var(--qs-danger)" : "var(--qs-success)" }}>
                {addEntryMsg}
              </div>
            )}
          </div>

          {/* Commission rate reminder — all three tiers */}
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setRatesOpen(!ratesOpen)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--qs-dim)", cursor: "pointer", background: "none", border: "none", padding: "4px 0", width: "100%", textAlign: "left" }}
            >
              <ChevronRight style={{ width: 14, height: 14, transition: "transform 0.2s", transform: ratesOpen ? "rotate(90deg)" : "rotate(0deg)" }} />
              Commission Rates Reference
            </button>
            {ratesOpen && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {Object.entries(COMMISSION).map(([key, val]) => (
                  <div key={key} style={{ background: "var(--qs-elevated)", border: `1px solid ${PRODUCT_COLORS[key]}33`, borderRadius: 6, padding: "6px 12px", fontSize: 11 }}>
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
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--qs-muted)", fontSize: 13 }}>No entries in this range. Add manually or upload an Allstate report.</div>
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
                      <td style={{ color: "var(--qs-subtle)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.date}</td>
                      <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{e.issuedDate}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span className="tag" style={{
                            background: `${PRODUCT_COLORS[e.product]}22`,
                            color: PRODUCT_COLORS[e.product]
                          }}>
                            {PRODUCT_LABELS[e.product] ?? e.product}
                          </span>
                          {isExcludedLine(e.product) && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              borderRadius: 3, letterSpacing: '0.04em',
                              background: '#F59E0B18', color: '#F59E0B',
                              border: '1px solid #F59E0B33',
                            }}>
                              EXCL
                            </span>
                          )}
                        </span>
                      </td>
                      <td><span className="tag" style={{ background: `${TIER_COLORS[tier]}22`, color: TIER_COLORS[tier] }}>{TIER_LABELS[tier]}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace" }}>{fmtFull$(e.premium)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", textAlign: "right" }}>
                        <span style={{ color: "var(--qs-success)", display: "block" }}>
                          {fmtFull$(calcCommission(e.premium, e.product, tier, COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES))}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--qs-muted)", display: "block" }}>
                          {showingVCRates
                            ? `Base: ${fmtFull$(calcCommission(e.premium, e.product, tier, COMMISSIONABLE_FACTORS, false, BASE_RATES))}`
                            : `VC: ${fmtFull$(calcCommission(e.premium, e.product, tier, COMMISSIONABLE_FACTORS, true,  BASE_RATES))}`}
                        </span>
                      </td>
                      <td><span className="tag" style={{ background: e.source==="upload" ? "#1E3A5F" : "#1E3348", color: e.source==="upload" ? "#60A5FA" : "var(--qs-dim)" }}>{e.source}</span></td>
                      <td style={{ color: "var(--qs-subtle)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</td>
                      <td><button className="del-btn" onClick={() => deleteEntry(e.id)} style={{ padding: 8, minWidth: 44, minHeight: 44, lineHeight: 1 }}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ color: "var(--qs-subtle)", fontWeight: 600, paddingTop: 12 }}>Total</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--qs-bright)", paddingTop: 12 }}>{fmtFull$(totals.totalPremium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "var(--qs-success)", paddingTop: 12 }}>{fmtFull$(totals.totalCommission)}</td>
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
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--qs-dim)", marginBottom: 4 }}>Upload Allstate Export</div>
          <div style={{ fontSize: 12, color: "var(--qs-subtle)", marginBottom: 20 }}>
            Accepts XLSX or CSV. Expects columns: <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>Effective Date, Written Premium, Line of Business, Bundle Tier</span> (or similar Allstate report headers). <span style={{ color: "var(--qs-subtle)" }}>Bundle Tier column is optional — rows without it default to Monoline.</span>
          </div>
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
            <div style={{ fontSize: 32, marginBottom: 10 }}>📤</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--qs-subtle)" }}>{uploading ? "Processing…" : "Click to upload or drag & drop"}</div>
            <div style={{ fontSize: 12, color: "var(--qs-muted)", marginTop: 4 }}>XLSX, XLS, or CSV</div>
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 14, padding: "10px 16px", background: "var(--qs-elevated)", borderRadius: 8, fontSize: 13, color: "var(--qs-dim)" }}>{uploadMsg}</div>
          )}
          <div style={{ marginTop: 24, padding: 16, background: "var(--qs-elevated)", borderRadius: 10, border: "1px solid var(--qs-border)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qs-subtle)", marginBottom: 8 }}>Commission Reference — New Business Rates by Tier</div>
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
              <span style={{ color: "var(--qs-dim)" }}>Commission Revenue Goal</span>
              <span style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(totals.totalCommission)} / {fmtFull$(COMMISSION_GOAL)}</span>
            </div>
            <div style={{ height: 14, background: "var(--qs-border)", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(totals.totalCommission / COMMISSION_GOAL * 100, 100)}%`, background: totals.totalCommission >= COMMISSION_GOAL ? "var(--qs-success)" : "linear-gradient(90deg, var(--qs-success), var(--qs-info))", borderRadius: 7, transition: "width 0.5s" }} />
            </div>
          </div>
          <table>
            <thead><tr><th>Month</th><th>Commission</th><th>vs {fmt$(COMMISSION_GOAL)} Goal</th></tr></thead>
            <tbody>
              {trendData.map(d => (
                <tr key={d.name}>
                  <td style={{ color: "var(--qs-dim)" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "var(--qs-success)" : "var(--qs-bright)" }}>{fmtFull$(d.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "var(--qs-success)" : "var(--qs-danger)" }}>{d.commission > 0 ? fmtPct(d.commission / COMMISSION_GOAL) : "—"}</td>
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
              <span style={{ color: "var(--qs-dim)" }}>Written Premium Volume</span>
              <span style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace" }}>{fmtFull$(totals.totalPremium)} / {fmtFull$(PREMIUM_GOAL)}</span>
            </div>
            <div style={{ height: 14, background: "var(--qs-border)", borderRadius: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`, background: "linear-gradient(90deg, var(--qs-info), var(--qs-purple))", borderRadius: 7, transition: "width 0.5s" }} />
            </div>
          </div>
          <table>
            <thead><tr><th>Month</th><th>Premium</th><th>vs {fmt$(PREMIUM_GOAL)} Target</th></tr></thead>
            <tbody>
              {trendData.map(d => (
                <tr key={d.name}>
                  <td style={{ color: "var(--qs-dim)" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-bright)" }}>{fmtFull$(d.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: d.premium >= PREMIUM_GOAL ? "var(--qs-success)" : "var(--qs-subtle)" }}>{d.premium > 0 ? fmtPct(d.premium / PREMIUM_GOAL) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Written Premium */}
      {modal === "kpi-written" && (
        <DrillDownModal title="Written Premium" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "var(--qs-bright)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(totals.totalPremium)}</div>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 24 }}>Total written premium · {rangeLabel}</div>
          <table>
            <thead><tr><th>Month</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {trendData.slice(-6).map(d => (
                <tr key={d.name}>
                  <td style={{ color: "var(--qs-dim)" }}>{d.name}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(d.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(d.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Commission Earned */}
      {modal === "kpi-commission" && (
        <DrillDownModal title="Commission Earned" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "var(--qs-success)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{fmtFull$(totals.totalCommission)}</div>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 24 }}>Blended rate: {totals.totalPremium > 0 ? fmtPct(totals.totalCommission / totals.totalPremium) : "—"} · {rangeLabel}</div>
          <table>
            <thead><tr><th>Product</th><th>Premium</th><th>Commission</th><th>Eff. Rate</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.premium > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(val.commission)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{fmtPct(val.commission / val.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DrillDownModal>
      )}

      {/* KPI — Policies */}
      {modal === "kpi-policies" && (
        <DrillDownModal title="Policies Written" onClose={closeModal}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "var(--qs-bright)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>{filtered.reduce((s,e) => s + e.policyCount, 0)}</div>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 24 }}>Total policies · {rangeLabel} · Avg premium: {filtered.length > 0 ? fmtFull$(totals.totalPremium / filtered.reduce((s,e) => s + e.policyCount, 0)) : "—"}</div>
          <table>
            <thead><tr><th>Product</th><th>Policies</th><th>Premium</th><th>Commission</th></tr></thead>
            <tbody>
              {Object.entries(totals.byProduct).filter(([,v]) => v.count > 0).map(([key, val]) => (
                <tr key={key}>
                  <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{val.count}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(val.premium)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(val.commission)}</td>
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
            <div style={{ fontSize: 42, fontWeight: 700, color: onTrack ? "var(--qs-success)" : "var(--qs-warning)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              {vcBaselineCount} <span style={{ fontSize: 20, color: "var(--qs-subtle)" }}>/ {VC_BASELINE_TARGET}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 12 }}>
              Auto + HO items · {rangeLabel}
            </div>
            <div style={{ height: 8, background: "var(--qs-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
              <div style={{ height: "100%", width: `${pct * 100}%`, background: onTrack ? "var(--qs-success)" : "var(--qs-warning)", borderRadius: 4, transition: "width 0.4s" }} />
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
                  <td><span style={{ background: "#3B82F622", color: "var(--qs-info)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Auto</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>
                    {filtered.filter(e => e.product === "auto").length}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)", fontWeight: 700 }}>{autoItems}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>✓</td>
                </tr>
                <tr>
                  <td><span style={{ background: "#10B98122", color: "var(--qs-success)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>HO / Condo</span></td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>
                    {filtered.filter(e => e.product === "ho").length}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)", fontWeight: 700 }}>{hoItems}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>✓</td>
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
                      <td><span style={{ background: "#33415522", color: "var(--qs-subtle)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{label}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{policies.length}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{items}</td>
                      <td style={{ color: "var(--qs-muted)" }}>—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!onTrack && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--qs-warning)", background: "#F59E0B11", borderRadius: 6, padding: "8px 12px" }}>
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
            <div style={{ fontSize: 42, fontWeight: 700, color: "var(--qs-bright)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
              {totalPoints}
            </div>
            <div style={{ fontSize: 13, color: pointsDelta >= 0 ? "var(--qs-success)" : "var(--qs-danger)", marginBottom: 24 }}>
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
                      <span style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] ?? "var(--qs-subtle)", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {PRODUCT_LABELS[key] ?? key}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-dim)" }}>{val.policies}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{val.items}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{PORTFOLIO_POINTS[key] ?? 0}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-bright)", fontWeight: 700 }}>{val.points}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: "1px solid var(--qs-border)" }}>
                  <td style={{ color: "var(--qs-bright)", fontWeight: 600 }}>Total</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-dim)" }}>
                    {rows.reduce((s, [, v]) => s + v.policies, 0)}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>
                    {rows.reduce((s, [, v]) => s + v.items, 0)}
                  </td>
                  <td />
                  <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)", fontWeight: 700 }}>{totalPoints}</td>
                </tr>
              </tbody>
            </table>

            {/* Prior month comparison */}
            {priorPoints > 0 && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--qs-subtle)", borderTop: "1px solid var(--qs-elevated)", paddingTop: 12 }}>
                Prior month: <span style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-dim)" }}>{priorPoints} pts</span>
                &nbsp;·&nbsp;
                Net: <span style={{ fontFamily: "'DM Mono', monospace", color: pointsDelta >= 0 ? "var(--qs-success)" : "var(--qs-danger)" }}>
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
              <div style={{ fontSize: 42, fontWeight: 700, color: "var(--qs-info)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                {Math.round((totals.totalPremium / PREMIUM_GOAL) * 100)}%
              </div>
              <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 16 }}>
                {fmtFull$(totals.totalPremium)} written of {fmtFull$(PREMIUM_GOAL)} goal · {rangeLabel}
              </div>
              <div style={{ height: 10, background: "var(--qs-border)", borderRadius: 5, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ height: "100%", width: `${Math.min(totals.totalPremium / PREMIUM_GOAL * 100, 100)}%`, background: "linear-gradient(90deg, var(--qs-info), var(--qs-purple))", borderRadius: 5 }} />
              </div>
              <table>
                <thead><tr><th>Month</th><th>Premium</th><th>Goal %</th></tr></thead>
                <tbody>
                  {trendData.slice(-6).map(d => (
                    <tr key={d.name}>
                      <td style={{ color: "var(--qs-dim)" }}>{d.name}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(d.premium)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.premium >= PREMIUM_GOAL ? "var(--qs-success)" : "var(--qs-subtle)" }}>
                        {d.premium > 0 ? fmtPct(d.premium / PREMIUM_GOAL) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <div style={{ fontSize: 42, fontWeight: 700, color: commissionGoalPct >= 1 ? "var(--qs-success)" : "var(--qs-warning)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                {Math.round(commissionGoalPct * 100)}%
              </div>
              <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 16 }}>
                {fmtFull$(totals.totalCommission)} earned of {fmtFull$(COMMISSION_GOAL)} goal · {rangeLabel}
              </div>
              <div style={{ height: 10, background: "var(--qs-border)", borderRadius: 5, overflow: "hidden", marginBottom: 24 }}>
                <div style={{ height: "100%", width: `${Math.min(commissionGoalPct * 100, 100)}%`, background: commissionGoalPct >= 1 ? "var(--qs-success)" : "linear-gradient(90deg, var(--qs-success), var(--qs-info))", borderRadius: 5 }} />
              </div>
              <table>
                <thead><tr><th>Month</th><th>Commission</th><th>Goal %</th></tr></thead>
                <tbody>
                  {trendData.slice(-6).map(d => (
                    <tr key={d.name}>
                      <td style={{ color: "var(--qs-dim)" }}>{d.name}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "var(--qs-success)" : "var(--qs-text)" }}>{fmtFull$(d.commission)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: d.commission >= COMMISSION_GOAL ? "var(--qs-success)" : "var(--qs-danger)" }}>
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
          <div style={{ fontSize: 40, fontWeight: 700, color: modalMode === "commission" ? (pace.onPace ? "var(--qs-success)" : "var(--qs-warning)") : "var(--qs-info)", fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
            {modalMode === "commission" ? fmtFull$(pace.projectedCommission) : fmtFull$(pace.projectedPremium)}
          </div>
          <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 20 }}>
            {pace.onPace ? "↑ On pace" : "↓ Behind pace"} · Biz day {pace.elapsed}/{pace.totalDays} · projected by month-end
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Commission Earned",    value: fmtFull$(totals.totalCommission),   color: "var(--qs-success)" },
              { label: "Projected Commission", value: fmtFull$(pace.projectedCommission), color: pace.onPace ? "var(--qs-success)" : "var(--qs-warning)" },
              { label: "Premium Written",      value: fmtFull$(totals.totalPremium),      color: "var(--qs-text)" },
              { label: "Projected Premium",    value: fmtFull$(pace.projectedPremium),    color: "var(--qs-info)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "var(--qs-elevated)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--qs-border)" }}>
                <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
              </div>
            ))}
          </div>
        </DrillDownModal>
      )}

      {/* Daily Target drill-down */}
      {modal === "daily" && dailyTarget && (() => {
        const dailyModes = {
          commission: { label: "DAILY TARGET",         value: fmtFull$(dailyTarget.dailyCommissionNeeded),          unit: "commission / day", color: "var(--qs-warning)" },
          premium:    { label: "DAILY PREMIUM TARGET", value: fmtFull$(dailyTarget.dailyPremiumNeeded),             unit: "premium / day",    color: "var(--qs-info)" },
          policies:   { label: "POLICIES / DAY",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—", unit: "policies needed",  color: "var(--qs-success)" },
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
            <div style={{ fontSize: 13, color: "var(--qs-subtle)", marginBottom: 20 }}>
              {active.unit} · {dailyTarget.remaining} business days left
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Commission Remaining", value: fmtFull$(dailyTarget.commissionRemaining), color: "var(--qs-warning)" },
                { label: "Premium Remaining",    value: fmtFull$(dailyTarget.premiumRemaining),    color: "var(--qs-info)" },
                { label: "Daily Premium Needed", value: fmtFull$(dailyTarget.dailyPremiumNeeded),  color: "var(--qs-text)" },
                { label: "Policies / Day",       value: dailyTarget.policiesPerDayNeeded?.toFixed(1) ?? "—", color: "var(--qs-success)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: "var(--qs-elevated)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--qs-border)" }}>
                  <div style={{ fontSize: 11, color: "var(--qs-subtle)", marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
                </div>
              ))}
            </div>
            {dailyTarget.avgCommissionPerPolicy && (
              <div style={{ fontSize: 12, color: "var(--qs-muted)", marginTop: 16 }}>
                Based on {dailyTarget.totalPolicies} policies · avg {fmtFull$(dailyTarget.avgCommissionPerPolicy)} commission · {fmtFull$(dailyTarget.avgPremiumPerPolicy)} premium per policy
              </div>
            )}
          </DrillDownModal>
        );
      })()}

      {/* Trend chart drill-down */}
      {modal === "trend" && (
        <DrillDownModal title={`Monthly Commission Earned vs ${fmt$(COMMISSION_GOAL)} Goal`} onClose={closeModal}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2130" />
                <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1A1D27", border: "1px solid #252A3A", borderRadius: 8, fontSize: 12, color: "#E2E8F0" }} labelStyle={{ color: "#94A3B8" }} itemStyle={{ color: "#E2E8F0" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [fmtFull$(v), "Commission"]} />
                <ReferenceLine y={COMMISSION_GOAL} stroke="#10B981" strokeDasharray="4 4" label={{ value: fmt$(COMMISSION_GOAL), fill: "#10B981", fontSize: 11 }} />
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
        const VC_KEYS   = productConfig.vcEligibleKeys;
        const CORE_KEYS = productConfig.coreKeys;
        const AUTO_KEYS  = ["auto"];
        const ALL_KEYS   = ["auto", "specialty_auto", "ho", "condo", "renters", "landlord", "pup", "boat", "manufactured", "motor_club", "other"];

        const statsKeys = productStatsMode === "vc"
          ? VC_KEYS
          : productStatsMode === "core"
          ? CORE_KEYS
          : productStatsMode === "auto"
          ? AUTO_KEYS
          : ALL_KEYS;

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
              { key: "all",  label: "All Products" },
              { key: "vc",   label: "VC Eligible" },
              { key: "core", label: productConfig.coreKeys.map(k => productConfig.productLabels[k] || k).join(' + ') },
              { key: "auto", label: "Auto" },
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
            {productStatsMode === "vc"   && "Auto · Specialty Auto · Home · Condo · Renters · Landlord · PUP · Boat · Manufactured"}
            {productStatsMode === "core" && "Auto · Homeowners"}
            {productStatsMode === "auto" && "Standard Auto only"}
            {productStatsMode === "all"  && "All product lines"}
          </div>

          {/* Stats strip — 5 cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              {
                label: "BLENDED RATE",
                value: statsBlendedRate != null ? fmtPct(statsBlendedRate) : "—",
                sub: `${statsPolicyCount} policies · ${statsItemCount} items`,
                color: "var(--qs-success)",
              },
              {
                label: "TOTAL ITEMS",
                value: String(statsItemCount),
                sub: `${statsPolicyCount} policies`,
                color: "var(--qs-info)",
              },
              {
                label: "AVG COMMISSION / POLICY",
                value: statsPolicyCount > 0 ? fmtFull$(statsCommission / statsPolicyCount) : "—",
                sub: "commission ÷ policies",
                color: "var(--qs-info)",
              },
              {
                label: "PREMIUM",
                value: fmtFull$(statsPremium),
                sub: statsPremiumShare != null ? `${(statsPremiumShare * 100).toFixed(1)}% of total` : "—",
                color: "var(--qs-warning)",
              },
              {
                label: "COMMISSION",
                value: fmtFull$(statsCommission),
                sub: statsCommissionShare != null ? `${(statsCommissionShare * 100).toFixed(1)}% of total` : "—",
                color: "var(--qs-success)",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: "var(--qs-elevated)", border: "1px solid var(--qs-border)", borderRadius: 10, padding: "14px 18px", flex: "1 1 130px", minWidth: 120 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Product breakdown bars — filtered by mode */}
          <div style={{ marginBottom: 24 }}>
            <ProductBreakdownRows
              byProduct={Object.fromEntries(statsKeys.filter(k => totals.byProduct[k]).map(k => [k, totals.byProduct[k]]))}
              totalPremium={statsPremium}
              totalCommission={statsCommission}
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
                <th>Avg Comm/Policy</th>
                <th>Avg/Item</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(totals.byProduct)
                .filter(([key, v]) => v.premium > 0 && statsKeys.includes(key))
                .sort(([, a], [, b]) => b.premium - a.premium)
                .map(([key, val]) => {
                  const pct = totals.totalPremium > 0 ? (val.premium / totals.totalPremium * 100).toFixed(1) : "—";
                  const avgPrem = val.count > 0 ? fmtFull$(val.premium / val.count) : "—";
                  const avgCommPerPolicy = val.count > 0 ? fmtFull$(val.commission / val.count) : "—";
                  return (
                    <tr key={key}>
                      <td><span className="tag" style={{ background: `${PRODUCT_COLORS[key]}22`, color: PRODUCT_COLORS[key] }}>{COMMISSION[key].label}</span></td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(val.premium)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-dim)", fontWeight: 600 }}>{pct}%</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(val.commission)}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{fmtPct(val.commission / val.premium)}</td>
                      <td style={{ color: "var(--qs-text)" }}>{val.count}</td>
                      <td style={{ color: "var(--qs-subtle)" }}>{val.itemCount ?? val.count}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-subtle)" }}>{avgPrem}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{avgCommPerPolicy}</td>
                      <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-dim)" }}>{val.itemCount > 0 ? fmtFull$(Math.round(val.premium / val.itemCount)) : "—"}</td>
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
          acc.commission += calcCommission(e.premium ?? 0, e.product, e.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
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
                { label: "Est. Commission", value: fmtFull$(producerTotals.commission), color: "var(--qs-success)" },
                { label: "Points",          value: producerTotals.points },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--qs-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--qs-bright)" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* CCC context note */}
            {producerModal === "CCC" && (
              <p style={{ fontSize: 12, color: "var(--qs-subtle)", fontStyle: "italic", marginBottom: 16 }}>
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
                    const comm = calcCommission(entry.premium ?? 0, entry.product, entry.tier ?? "monoline", COMMISSIONABLE_FACTORS, showingVCRates, BASE_RATES);
                    const pts = (PORTFOLIO_POINTS[entry.product] ?? 0) * (entry.itemCount ?? 1);
                    const issuedFmt = entry.date ? new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—";
                    return (
                      <tr key={entry.id}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRODUCT_COLORS[entry.product] ?? "var(--qs-subtle)", flexShrink: 0 }} />
                            {PRODUCT_LABELS[entry.product] ?? entry.product}
                            {isExcludedLine(entry.product) && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 5px',
                                borderRadius: 3, letterSpacing: '0.04em',
                                background: '#F59E0B18', color: '#F59E0B',
                                border: '1px solid #F59E0B33',
                              }}>
                                EXCL
                              </span>
                            )}
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
                        <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{entry.policyNo || "—"}</td>
                        <td style={{ color: "var(--qs-dim)", fontSize: 12 }}>{maskCustomerName(entry.customerName)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{entry.itemCount ?? 1}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{fmtFull$(entry.premium)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(comm)}</td>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-text)" }}>{pts}</td>
                        <td style={{ color: "var(--qs-dim)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{issuedFmt}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td style={{ color: "var(--qs-bright)" }}>Total</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-bright)" }}>{producerTotals.items}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-bright)" }}>{fmtFull$(producerTotals.premium)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-success)" }}>{fmtFull$(producerTotals.commission)}</td>
                    <td style={{ fontFamily: "'DM Mono', monospace", color: "var(--qs-bright)" }}>{producerTotals.points}</td>
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
