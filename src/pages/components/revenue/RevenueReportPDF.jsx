// src/pages/components/revenue/RevenueReportPDF.jsx
// PDF report for Revenue Projections — generated on-demand via @react-pdf/renderer.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const GOAL = 40000;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 32,
    color: "#1f2937",
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: {
    fontSize: 8,
    color: "#3b82f6",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 9,
    color: "#6b7280",
  },
  meta: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "right",
  },

  // ── Section headings ─────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#6b7280",
    marginBottom: 6,
    marginTop: 14,
  },

  // ── KPI cards row ─────────────────────────────────────────────────────────
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 8,
  },
  kpiLabel: {
    fontSize: 7,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  kpiSub: {
    fontSize: 7,
    color: "#9ca3af",
    marginTop: 2,
  },

  // ── Progress bar ──────────────────────────────────────────────────────────
  progressWrap: {
    marginTop: 10,
    marginBottom: 2,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  progressLabel: {
    fontSize: 8,
    color: "#374151",
    fontFamily: "Helvetica-Bold",
  },
  progressAmt: {
    fontSize: 8,
    color: "#374151",
  },
  progressTrack: {
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#3b82f6",
  },

  // ── Product breakdown ─────────────────────────────────────────────────────
  productRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    alignItems: "center",
  },
  productName: {
    flex: 2,
    fontSize: 9,
  },
  productCell: {
    flex: 2,
    fontSize: 9,
    textAlign: "right",
    color: "#374151",
  },
  productCellGreen: {
    flex: 2,
    fontSize: 9,
    textAlign: "right",
    color: "#059669",
  },
  productHeader: {
    flex: 2,
    fontSize: 7,
    textTransform: "uppercase",
    color: "#9ca3af",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  productHeaderLeft: {
    flex: 2,
    fontSize: 7,
    textTransform: "uppercase",
    color: "#9ca3af",
    letterSpacing: 0.5,
  },

  // ── Entries table ─────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#f9fafb",
  },
  colDate:      { width: "12%", fontSize: 8, color: "#374151" },
  colProduct:   { width: "13%", fontSize: 8 },
  colTier:      { width: "11%", fontSize: 8 },
  colPremium:   { width: "13%", fontSize: 8, textAlign: "right" },
  colComm:      { width: "13%", fontSize: 8, textAlign: "right", color: "#059669" },
  colCount:     { width: "6%",  fontSize: 8, textAlign: "center" },
  colSource:    { width: "9%",  fontSize: 8, color: "#6b7280" },
  colNote:      { flex: 1,      fontSize: 8, color: "#6b7280" },
  colHdr: {
    fontSize: 7,
    textTransform: "uppercase",
    color: "#9ca3af",
    letterSpacing: 0.4,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#9ca3af",
  },

  // ── Totals row ────────────────────────────────────────────────────────────
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    marginTop: 2,
  },
  totalLabel: {
    width: "42%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  totalPremium: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
  },
  totalComm: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    color: "#059669",
  },
  totalSpacer: { flex: 1 },
});

// ── Formatters (no Intl in react-pdf environment) ─────────────────────────────
const fmt$ = (n) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

const COMMISSION = {
  auto:    { preferred: 0.25, bundled: 0.20, monoline: 0.15, label: "Auto" },
  ho:      { preferred: 0.29, bundled: 0.25, monoline: 0.16, label: "HO / Condo" },
  renters: { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Renters" },
  other:   { preferred: 0.26, bundled: 0.21, monoline: 0.15, label: "Other Personal Lines" },
};
const TIER_LABELS = { preferred: "Preferred", bundled: "Bundled", monoline: "Monoline" };

function calcCommission(premium, product, tier = "monoline") {
  const rates = COMMISSION[product] ?? COMMISSION.other;
  return premium * (rates[tier] ?? rates.monoline);
}

// ── Main PDF document ─────────────────────────────────────────────────────────
export default function RevenueReportPDF({ entries, totals, rangeLabel, view, goalPct }) {
  const generated = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const goalFillPct = Math.min(goalPct * 100, 100);
  const totalPolicies = entries.reduce((s, e) => s + e.policyCount, 0);
  const blendedRate = totals.totalPremium > 0
    ? fmtPct(totals.totalCommission / totals.totalPremium)
    : "—";

  return (
    <Document
      title={`Revenue Projections — ${rangeLabel}`}
      author="insuredbycam.com"
    >
      <Page size="LETTER" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>insuredbycam.com</Text>
            <Text style={styles.title}>Revenue Projections</Text>
            <Text style={styles.subtitle}>
              New Business · {rangeLabel} · Goal: {fmt$(GOAL)}/mo
            </Text>
          </View>
          <View>
            <Text style={styles.meta}>Generated {generated}</Text>
            <Text style={styles.meta}>{view === "ytd" ? "Year-to-Date" : "This Month"} Report</Text>
          </View>
        </View>

        {/* ── KPI cards ── */}
        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Written Premium</Text>
            <Text style={styles.kpiValue}>{fmt$(totals.totalPremium)}</Text>
            <Text style={styles.kpiSub}>{rangeLabel}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Commission Earned</Text>
            <Text style={[styles.kpiValue, { color: "#059669" }]}>{fmt$(totals.totalCommission)}</Text>
            <Text style={styles.kpiSub}>Blended rate: {blendedRate}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Policies Written</Text>
            <Text style={styles.kpiValue}>{totalPolicies}</Text>
            <Text style={styles.kpiSub}>
              {totalPolicies > 0 ? `Avg: ${fmt$(totals.totalPremium / totalPolicies)}` : "—"}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Goal Progress</Text>
            <Text style={[styles.kpiValue, { color: goalPct >= 1 ? "#059669" : "#d97706" }]}>
              {Math.round(goalPct * 100)}%
            </Text>
            <Text style={styles.kpiSub}>
              {totals.totalPremium < GOAL ? `${fmt$(GOAL - totals.totalPremium)} remaining` : "Goal reached"}
            </Text>
          </View>
        </View>

        {/* ── Progress bar ── */}
        <View style={styles.progressWrap}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>$40K Monthly New Business Goal</Text>
            <Text style={styles.progressAmt}>{fmt$(totals.totalPremium)} / {fmt$(GOAL)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${goalFillPct}%`,
              backgroundColor: goalPct >= 1 ? "#059669" : "#3b82f6",
            }]} />
          </View>
        </View>

        {/* ── Product breakdown ── */}
        {Object.values(totals.byProduct).some(v => v.premium > 0) && (
          <>
            <Text style={styles.sectionTitle}>By Product Line</Text>
            <View style={{ flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
              <Text style={styles.productHeaderLeft}>Product</Text>
              <Text style={styles.productHeader}>Written Premium</Text>
              <Text style={styles.productHeader}>Commission</Text>
              <Text style={styles.productHeader}>Eff. Rate</Text>
              <Text style={styles.productHeader}>Policies</Text>
            </View>
            {Object.entries(totals.byProduct)
              .filter(([, v]) => v.premium > 0)
              .map(([key, val]) => (
                <View key={key} style={styles.productRow}>
                  <Text style={styles.productName}>{COMMISSION[key]?.label ?? key}</Text>
                  <Text style={styles.productCell}>{fmt$(val.premium)}</Text>
                  <Text style={styles.productCellGreen}>{fmt$(val.commission)}</Text>
                  <Text style={styles.productCell}>{val.premium > 0 ? fmtPct(val.commission / val.premium) : "—"}</Text>
                  <Text style={styles.productCell}>{val.count}</Text>
                </View>
              ))}
            <View style={styles.productRow}>
              <Text style={[styles.productName, { fontFamily: "Helvetica-Bold" }]}>Total</Text>
              <Text style={[styles.productCell, { fontFamily: "Helvetica-Bold" }]}>{fmt$(totals.totalPremium)}</Text>
              <Text style={[styles.productCellGreen, { fontFamily: "Helvetica-Bold" }]}>{fmt$(totals.totalCommission)}</Text>
              <Text style={styles.productCell}>{blendedRate}</Text>
              <Text style={[styles.productCell, { fontFamily: "Helvetica-Bold" }]}>{totalPolicies}</Text>
            </View>
          </>
        )}

        {/* ── Entries table ── */}
        {entries.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Policy Entries ({entries.length})</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colDate,    styles.colHdr]}>Date</Text>
              <Text style={[styles.colProduct, styles.colHdr]}>Product</Text>
              <Text style={[styles.colTier,    styles.colHdr]}>Tier</Text>
              <Text style={[styles.colPremium, styles.colHdr]}>Premium</Text>
              <Text style={[styles.colComm,    styles.colHdr]}>Commission</Text>
              <Text style={[styles.colCount,   styles.colHdr]}>Qty</Text>
              <Text style={[styles.colSource,  styles.colHdr]}>Source</Text>
              <Text style={[styles.colNote,    styles.colHdr]}>Note</Text>
            </View>
            {entries.map((e, i) => {
              const tier = e.tier ?? "monoline";
              return (
                <View key={e.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                  <Text style={styles.colDate}>{e.date}</Text>
                  <Text style={styles.colProduct}>{COMMISSION[e.product]?.label ?? e.product}</Text>
                  <Text style={styles.colTier}>{TIER_LABELS[tier]}</Text>
                  <Text style={styles.colPremium}>{fmt$(e.premium)}</Text>
                  <Text style={styles.colComm}>{fmt$(calcCommission(e.premium, e.product, tier))}</Text>
                  <Text style={styles.colCount}>{e.policyCount}</Text>
                  <Text style={styles.colSource}>{e.source}</Text>
                  <Text style={styles.colNote} numberOfLines={1}>{e.note}</Text>
                </View>
              );
            })}
            <View style={styles.totalsRow}>
              <Text style={styles.totalLabel}>Total ({entries.length} entries)</Text>
              <Text style={styles.totalPremium}>{fmt$(totals.totalPremium)}</Text>
              <Text style={styles.totalComm}>{fmt$(totals.totalCommission)}</Text>
              <Text style={styles.totalSpacer} />
            </View>
          </>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>insuredbycam.com · Revenue Projections · {rangeLabel}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  );
}
