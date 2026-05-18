// src/pages/components/book/BookPitchPDF.jsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { getBuyoutTerms, estimateBookValue } from '../../../lib/carrierBuyoutTerms';

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

  bigStatRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 16,
  },
  bigStat: {
    flex: 1, padding: 12, backgroundColor: '#f1f5f9',
    borderRadius: 6, marginHorizontal: 4,
  },
  bigStatLabel: {
    fontSize: 8, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 3,
  },
  bigStatValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  bigStatSubline: { fontSize: 8, color: '#94a3b8', marginTop: 2 },

  table: { marginBottom: 12 },
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

  alertBox: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: 4, padding: 10, marginBottom: 14,
  },
  alertTitle: {
    fontSize: 11, fontFamily: 'Helvetica-Bold',
    color: '#991b1b', marginBottom: 4,
  },
  alertBody: { fontSize: 10, color: '#7f1d1d' },

  moveCard: {
    backgroundColor: '#f8fafc', borderLeftWidth: 3, borderLeftColor: '#3b82f6',
    padding: 10, marginBottom: 10,
  },
  moveTitle: {
    fontSize: 11, fontFamily: 'Helvetica-Bold',
    color: '#0f172a', marginBottom: 3,
  },
  moveDesc: { fontSize: 9, color: '#475569', marginBottom: 4 },
  moveNext: { fontSize: 9, color: '#1e40af', fontFamily: 'Helvetica-Bold' },

  footer: {
    position: 'absolute', bottom: 20, left: 36, right: 36,
    fontSize: 8, color: '#94a3b8', textAlign: 'center',
    borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 6,
  },
});

const PRODUCT_LABELS = {
  auto: 'Auto', ho: 'Homeowners', condo: 'Condo', renters: 'Renters',
  landlord: 'Landlord', specialty_auto: 'Specialty Auto',
  pup: 'Umbrella', manufactured: 'Mfd Home',
  boat: 'Boat', motor_club: 'Motor Club', other: 'Other',
};

export default function BookPitchPDF({ agencyName, aggregates, moves }) {
  const topCarrier = aggregates.byCarrier[0];
  const topCarrierShare = topCarrier?.premiumShare ?? 0;
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Scenario: 10% comp cut against top carrier
  const compCutDollars = topCarrier ? topCarrier.commission * 0.10 : 0;

  // Scenario: forced termination, typical buyout
  const buyoutValue = topCarrier
    ? estimateBookValue(topCarrier.commission, topCarrier.carrier_code, 'typical')
    : 0;
  const buyoutTerms = topCarrier ? getBuyoutTerms(topCarrier.carrier_code) : null;

  return (
    <Document>
      {/* Page 1: Executive Summary */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>QuoteSync · Book Analysis</Text>
          <Text style={styles.title}>{agencyName ?? 'Agency'}</Text>
          <Text style={styles.subtitle}>Carrier Concentration & Blast-Radius Report · {generatedDate}</Text>
        </View>

        <View style={styles.bigStatRow}>
          <View style={styles.bigStat}>
            <Text style={styles.bigStatLabel}>Total premium</Text>
            <Text style={styles.bigStatValue}>${aggregates.totalPremium.toLocaleString()}</Text>
          </View>
          <View style={styles.bigStat}>
            <Text style={styles.bigStatLabel}>Annual commission</Text>
            <Text style={styles.bigStatValue}>${aggregates.totalCommission.toLocaleString()}</Text>
          </View>
          <View style={styles.bigStat}>
            <Text style={styles.bigStatLabel}>Policies</Text>
            <Text style={styles.bigStatValue}>{aggregates.totalPolicies.toLocaleString()}</Text>
          </View>
        </View>

        {topCarrierShare >= 60 && topCarrier && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>
              Carrier concentration: {topCarrier.carrier_name} holds {topCarrierShare.toFixed(1)}% of premium
            </Text>
            <Text style={styles.alertBody}>
              A pullback, comp change, non-renewal wave, or appointment termination from {topCarrier.carrier_name}{' '}
              directly impacts {topCarrierShare.toFixed(0)}% of agency revenue. This report quantifies that exposure and outlines diversification moves.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carrier Mix</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Carrier</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Policies</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Premium</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Share</Text>
            </View>
            {aggregates.byCarrier.map(c => (
              <View key={c.carrier_code} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 3 }]}>{c.carrier_name}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{c.policies}</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>${Math.round(c.premium).toLocaleString()}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{c.premiumShare.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Mix</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Product</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Policies</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Premium</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Share</Text>
            </View>
            {aggregates.byProduct.map(p => (
              <View key={p.product_key} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 3 }]}>{PRODUCT_LABELS[p.product_key] ?? p.product_key}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{p.policies}</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>${Math.round(p.premium).toLocaleString()}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{p.premiumShare.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.footer}>
          QuoteSync Book Analysis · Generated {generatedDate} · For internal planning use
        </Text>
      </Page>

      {/* Page 2: Blast-Radius Scenarios */}
      {topCarrier && (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.brand}>Blast-Radius Scenarios</Text>
            <Text style={styles.title}>What happens if {topCarrier.carrier_name} changes posture?</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scenario 1: 10% Commission Cut</Text>
            <Text style={styles.paragraph}>
              If {topCarrier.carrier_name} reduces commission rates by 10% — a typical defensive
              move when a carrier is repositioning — the impact on this agency:
            </Text>
            <View style={styles.bigStatRow}>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatLabel}>Annual commission lost</Text>
                <Text style={[styles.bigStatValue, { color: '#dc2626' }]}>
                  -${Math.round(compCutDollars).toLocaleString()}
                </Text>
                <Text style={styles.bigStatSubline}>
                  {aggregates.totalCommission > 0
                    ? ((compCutDollars / aggregates.totalCommission) * 100).toFixed(1)
                    : '0.0'}% of total commission
                </Text>
              </View>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatLabel}>Years to material recovery</Text>
                <Text style={[styles.bigStatValue, { color: '#dc2626' }]}>2–3</Text>
                <Text style={styles.bigStatSubline}>Through new business mix shift</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scenario 2: Forced Termination</Text>
            <Text style={styles.paragraph}>
              {buyoutTerms?.structureNote ?? 'Termination provisions vary by carrier.'}
            </Text>
            <View style={styles.bigStatRow}>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatLabel}>Estimated buyout</Text>
                <Text style={[styles.bigStatValue, { color: '#d97706' }]}>
                  ${Math.round(buyoutValue).toLocaleString()}
                </Text>
                <Text style={styles.bigStatSubline}>
                  {buyoutTerms?.tppMultiplierTypical}× typical multiplier
                </Text>
              </View>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatLabel}>Ongoing commission stopped</Text>
                <Text style={[styles.bigStatValue, { color: '#dc2626' }]}>
                  -${Math.round(topCarrier.commission).toLocaleString()}/yr
                </Text>
                <Text style={styles.bigStatSubline}>100% of {topCarrier.carrier_name} commission</Text>
              </View>
              <View style={styles.bigStat}>
                <Text style={styles.bigStatLabel}>Non-compete window</Text>
                <Text style={styles.bigStatValue}>
                  {buyoutTerms?.hasNonCompete ? `${buyoutTerms.nonCompeteYears} year(s)` : 'None'}
                </Text>
                <Text style={styles.bigStatSubline}>
                  {buyoutTerms?.hasNonCompete ? 'Restricts re-engagement of book' : 'Free to re-engage'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.footer}>
            QuoteSync Book Analysis · Generated {generatedDate} · For internal planning use
          </Text>
        </Page>
      )}

      {/* Page 3: Diversification Moves */}
      {moves.length > 0 && (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.brand}>Multi-Carrier Playbook</Text>
            <Text style={styles.title}>Diversification moves</Text>
            <Text style={styles.subtitle}>
              Personalized to {agencyName ?? 'this agency'}'s current book composition
            </Text>
          </View>

          {moves.map((m, i) => (
            <View key={m.id} style={[
              styles.moveCard,
              { borderLeftColor:
                  m.severity === 'critical' ? '#dc2626' :
                  m.severity === 'high'     ? '#d97706' :
                                              '#3b82f6'
              },
            ]}>
              <Text style={styles.moveTitle}>{i + 1}. {m.title}</Text>
              <Text style={styles.moveDesc}>{m.description}</Text>
              {m.nextStep && (
                <Text style={styles.moveNext}>→ {m.nextStep}</Text>
              )}
            </View>
          ))}

          <Text style={styles.footer}>
            QuoteSync Book Analysis · Generated {generatedDate} · For internal planning use
          </Text>
        </Page>
      )}
    </Document>
  );
}
