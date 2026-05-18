// src/pages/components/retention/TerminationReasonPDF.jsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 36,
    color: '#1f2937',
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#1e3a8a',
    paddingBottom: 12,
    marginBottom: 20,
  },
  brand: {
    fontSize: 8, color: '#3b82f6',
    textTransform: 'uppercase', letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#64748b' },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 14, fontFamily: 'Helvetica-Bold',
    color: '#1e3a8a', marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    paddingBottom: 4,
  },
  paragraph: { fontSize: 10, marginBottom: 6 },

  statRow: { flexDirection: 'row', marginBottom: 14 },
  stat: {
    flex: 1, padding: 10, backgroundColor: '#f1f5f9',
    borderRadius: 4, marginHorizontal: 3,
  },
  statLabel: {
    fontSize: 8, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  statValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  statSub: { fontSize: 8, color: '#94a3b8', marginTop: 2 },

  callout: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 4, padding: 10, marginBottom: 14,
  },
  calloutLabel: {
    fontSize: 8, color: '#991b1b', fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
  },
  calloutTitle: {
    fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#7f1d1d',
    marginBottom: 4,
  },
  calloutBody: { fontSize: 10, color: '#7f1d1d' },

  table: {},
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#1e3a8a',
    color: 'white', padding: 6,
  },
  tableHeaderCell: {
    fontSize: 8, fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row', borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0', padding: 6,
  },
  tableCell: { fontSize: 9 },

  footer: {
    position: 'absolute', bottom: 20, left: 36, right: 36,
    fontSize: 8, color: '#94a3b8', textAlign: 'center',
    borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6,
  },
});

const ACTION_CLASS_COLOR = {
  preventable: '#dc2626',
  partial:     '#d97706',
  external:    '#64748b',
};

const ACTION_CLASS_LABEL = {
  preventable: 'Preventable',
  partial:     'Partial',
  external:    'External',
};

export default function TerminationReasonPDF({
  agencyName,
  windowMonths,
  compared,
  totalCount,
  totalPremium,
  totalDeltaPct,
  preventablePct,
  topPreventable,
  actionCopy,
}) {
  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const visibleCats = (compared ?? []).filter(c => c.count > 0 || c.priorCount > 0);

  return (
    <Document>
      {/* Page 1: Summary */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>QuoteSync · Termination Analysis</Text>
          <Text style={styles.title}>{agencyName ?? 'Agency'}</Text>
          <Text style={styles.subtitle}>
            Last {windowMonths} months · Generated {generated}
          </Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Terminations</Text>
            <Text style={styles.statValue}>{totalCount}</Text>
            <Text style={[styles.statSub, totalDeltaPct != null && totalDeltaPct > 0 && { color: '#dc2626' }]}>
              {totalDeltaPct == null ? '—' : `${totalDeltaPct >= 0 ? '+' : ''}${totalDeltaPct.toFixed(1)}% vs prior ${windowMonths}mo`}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Premium lost</Text>
            <Text style={styles.statValue}>${Math.round(totalPremium || 0).toLocaleString()}</Text>
            <Text style={styles.statSub}>Annualized exposure</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Preventable %</Text>
            <Text style={[styles.statValue, { color: preventablePct >= 50 ? '#dc2626' : '#1e3a8a' }]}>
              {(preventablePct ?? 0).toFixed(0)}%
            </Text>
            <Text style={styles.statSub}>of terminations</Text>
          </View>
        </View>

        {topPreventable && (
          <View style={styles.callout}>
            <Text style={styles.calloutLabel}>Top preventable driver</Text>
            <Text style={styles.calloutTitle}>
              {topPreventable.display_name}: {topPreventable.count} terminations, ${Math.round(topPreventable.premium || 0).toLocaleString()} in premium
            </Text>
            <Text style={styles.calloutBody}>{actionCopy}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category breakdown</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Category</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Class</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Count</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Premium</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Share</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>vs prior</Text>
            </View>
            {visibleCats.map(c => (
              <View key={c.code} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 3, fontFamily: 'Helvetica-Bold' }]}>
                  {c.display_name}
                </Text>
                <Text style={[
                  styles.tableCell, { flex: 2, color: ACTION_CLASS_COLOR[c.action_class] },
                ]}>
                  {ACTION_CLASS_LABEL[c.action_class]}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{c.count}</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                  ${Math.round(c.premium || 0).toLocaleString()}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
                  {c.premiumShare.toFixed(1)}%
                </Text>
                <Text style={[
                  styles.tableCell, { flex: 1, textAlign: 'right' },
                  c.deltaPct != null && c.deltaPct > 0 && { color: '#dc2626', fontFamily: 'Helvetica-Bold' },
                  c.deltaPct != null && c.deltaPct < 0 && { color: '#059669', fontFamily: 'Helvetica-Bold' },
                ]}>
                  {c.deltaPct == null ? '—' : `${c.deltaPct >= 0 ? '+' : ''}${c.deltaPct.toFixed(0)}%`}
                </Text>
              </View>
            ))}
            <View style={[styles.tableRow, { backgroundColor: '#f1f5f9', borderTopWidth: 1, borderTopColor: '#cbd5e1' }]}>
              <Text style={[styles.tableCell, { flex: 3, fontFamily: 'Helvetica-Bold' }]}>Total</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}></Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{totalCount}</Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                ${Math.round(totalPremium || 0).toLocaleString()}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>100%</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}></Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          QuoteSync Termination Analysis · Generated {generated} · For internal use
        </Text>
      </Page>

      {/* Page 2: Method notes */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Termination Analysis · Methodology</Text>
          <Text style={styles.title}>How to read this report</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action classes</Text>
          <Text style={styles.paragraph}>
            Each category is tagged with an action class describing how much agency intervention
            can change the outcome:
          </Text>
          <Text style={styles.paragraph}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#dc2626' }}>Preventable: </Text>
            The loss could have been prevented by agency action — proactive outreach, payment
            follow-up, service excellence, or competitive remarketing. Focus interventions here.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#d97706' }}>Partial: </Text>
            The agency can influence outcomes (rewriting policies internally, capturing relocations
            in network) but not fully control them.
          </Text>
          <Text style={styles.paragraph}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#64748b' }}>External: </Text>
            Outside agency control — carrier underwriting actions, life events, customer death.
            These are tracked but cannot be intervened on.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categorization</Text>
          <Text style={styles.paragraph}>
            Raw termination reasons from carrier reports are mapped to canonical categories using
            a per-agency alias table and a built-in heuristic. Uncategorized reasons fall through
            to "Other / Uncategorized" and surface in the alias management page for review.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium definition</Text>
          <Text style={styles.paragraph}>
            "Premium" is the annual premium amount on the lapsed policy at the time of termination
            (the carrier report field labeled "Premium New" / "Annual Premium"). It represents the
            forward-looking exposure that walks out the door, not historical commission earned.
          </Text>
        </View>

        <Text style={styles.footer}>
          QuoteSync Termination Analysis · Generated {generated} · For internal use
        </Text>
      </Page>
    </Document>
  );
}
