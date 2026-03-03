// src/pages/components/time-attendance/ScorecardPDF.jsx
// One-page PDF scorecard for coaching 1:1s using @react-pdf/renderer.

import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer';
import { DEFAULT_TARGETS, calculateGrade, computeMetrics, GRADE_CONFIG } from '../../../config/csPerformanceDefaults';

const gradeColors = {
  A: '#15803d',
  B: '#1d4ed8',
  C: '#a16207',
  D: '#c2410c',
  F: '#dc2626',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 30,
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280',
  },
  gradeBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: 'white',
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
    color: '#1d4ed8',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  cellLabel: {
    width: '35%',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  cellTarget: {
    width: '20%',
    color: '#6b7280',
  },
  cellActual: {
    width: '25%',
    fontFamily: 'Helvetica-Bold',
  },
  cellStatus: {
    width: '20%',
  },
  metricLabel: {
    width: '35%',
  },
  metricTarget: {
    width: '20%',
    color: '#6b7280',
  },
  metricActual: {
    width: '25%',
    fontFamily: 'Helvetica-Bold',
  },
  metricStatus: {
    width: '20%',
  },
  proactivityRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  proactivityLabel: {
    width: '60%',
  },
  proactivityStatus: {
    width: '40%',
    fontFamily: 'Helvetica-Bold',
  },
  alertBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 4,
    padding: 8,
    marginTop: 10,
  },
  alertTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#991b1b',
    marginBottom: 4,
  },
  alertItem: {
    fontSize: 8,
    color: '#991b1b',
    marginBottom: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#9ca3af',
  },
  good: { color: '#16a34a' },
  bad: { color: '#dc2626' },
  neutral: { color: '#6b7280' },
});

function getMetricStatus(target, actual, inverse) {
  const numActual = parseFloat(actual) || 0;
  const isRange = typeof target === 'string' && target.includes('–');

  if (!target || target === 'Track only') return 'neutral';

  if (isRange) {
    const [lo, hi] = target.split('–').map((v) => parseFloat(v));
    if (numActual >= lo && numActual <= hi) return 'good';
    return numActual < lo ? (inverse ? 'good' : 'bad') : (inverse ? 'bad' : 'good');
  }

  const targetNum = parseFloat(target.replace(/[^0-9.]/g, ''));
  if (isNaN(targetNum)) return 'neutral';
  const isLt = target.startsWith('<');
  if (isLt) return numActual < targetNum ? 'good' : 'bad';
  return numActual >= targetNum ? 'good' : 'bad';
}

function MetricRowPDF({ label, target, actual, unit, inverse }) {
  const status = getMetricStatus(target, actual, inverse);
  return (
    <View style={styles.tableRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricTarget}>{target || '-'}</Text>
      <Text style={[styles.metricActual, styles[status]]}>
        {actual != null ? `${actual}${unit || ''}` : '-'}
      </Text>
      <Text style={[styles.metricStatus, styles[status]]}>
        {status === 'good' ? 'OK' : status === 'bad' ? 'MISS' : ''}
      </Text>
    </View>
  );
}

export default function ScorecardPDF({ rcData, daysWorked, targets, proactivity, alerts, weekStart }) {
  const t = { ...DEFAULT_TARGETS, ...targets };
  const metrics = computeMetrics(rcData, daysWorked);
  const grade = calculateGrade(rcData.outbound_calls, metrics.answerRate, metrics.hasZeroCallDays, t);

  const weekEnd = new Date(weekStart + 'T00:00:00');
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{rcData.employee_name || 'Employee'}</Text>
            <Text style={styles.subtitle}>
              Week: {fmtDate(weekStart + 'T00:00:00')} – {fmtDate(weekEnd)}
            </Text>
            <Text style={styles.subtitle}>Generated: {fmtDate(new Date())}</Text>
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: gradeColors[grade] || '#6b7280' }]}>
            <Text style={styles.gradeText}>{grade}</Text>
          </View>
        </View>

        {/* Section A */}
        <Text style={styles.sectionTitle}>Section A — Activity Metrics</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.cellLabel}>Metric</Text>
            <Text style={styles.cellTarget}>Target</Text>
            <Text style={styles.cellActual}>Actual</Text>
            <Text style={styles.cellStatus}>Status</Text>
          </View>
          <MetricRowPDF label="Total Calls" target={`≥ ${t.total_calls_weekly}`} actual={rcData.total_calls} />
          <MetricRowPDF label="Inbound Calls" target="Track only" actual={rcData.inbound_calls} />
          <MetricRowPDF label="Outbound Calls" target={`≥ ${t.outbound_calls_weekly}`} actual={rcData.outbound_calls} />
          <MetricRowPDF label="Avg Calls/Day" target={`≥ ${t.avg_calls_per_day}`} actual={metrics.avgCallsPerDay.toFixed(1)} />
          <MetricRowPDF label="Talk Time" target="≥ 8" actual={metrics.talkTimeHours.toFixed(1)} unit="h" />
          <MetricRowPDF
            label="Avg Handle Time"
            target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
            actual={(rcData.avg_handle_time_minutes || 0).toFixed(1)}
            unit=" min"
          />
        </View>

        {/* Section B */}
        <Text style={styles.sectionTitle}>Section B — Efficiency & Quality</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.cellLabel}>Metric</Text>
            <Text style={styles.cellTarget}>Target</Text>
            <Text style={styles.cellActual}>Actual</Text>
            <Text style={styles.cellStatus}>Status</Text>
          </View>
          <MetricRowPDF label="Answer Rate" target={`≥ ${t.answer_rate_pct}`} actual={metrics.answerRate.toFixed(1)} unit="%" />
          <MetricRowPDF label="Avg Speed of Answer" target={`< ${t.avg_speed_of_answer_sec}`} actual={(rcData.avg_speed_of_answer_seconds || 0).toFixed(0)} unit="s" inverse />
          <MetricRowPDF label="Avg Handle Time" target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`} actual={(rcData.avg_handle_time_minutes || 0).toFixed(1)} unit=" min" />
          <MetricRowPDF label="Avg Hold Time" target={`< ${t.avg_hold_time_min}`} actual={(rcData.avg_hold_time_minutes || 0).toFixed(1)} unit=" min" inverse />
          <MetricRowPDF label="Transfer Rate" target={`< ${t.transfer_rate_pct}`} actual={metrics.transferRate.toFixed(1)} unit="%" inverse />
          <MetricRowPDF label="Missed Call Rate" target={`< ${t.missed_call_rate_pct}`} actual={metrics.missedCallRate.toFixed(1)} unit="%" inverse />
        </View>

        {/* Section C */}
        <Text style={styles.sectionTitle}>Section C — Proactivity</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ width: '60%', ...styles.cellLabel }}>Flag</Text>
            <Text style={{ width: '40%', ...styles.cellLabel }}>Status</Text>
          </View>
          <View style={styles.proactivityRow}>
            <Text style={styles.proactivityLabel}>Outbound Every Day</Text>
            <Text style={[styles.proactivityStatus, metrics.outboundEveryDay ? styles.good : styles.bad]}>
              {metrics.outboundEveryDay ? 'Pass' : 'Fail'}
            </Text>
          </View>
          <View style={styles.proactivityRow}>
            <Text style={styles.proactivityLabel}>No 0-Call Days</Text>
            <Text style={[styles.proactivityStatus, !metrics.hasZeroCallDays ? styles.good : styles.bad]}>
              {!metrics.hasZeroCallDays ? 'Pass' : 'Fail'}
            </Text>
          </View>
          <View style={styles.proactivityRow}>
            <Text style={styles.proactivityLabel}>Follow-Up Notes Logged (manual)</Text>
            <Text style={[styles.proactivityStatus, proactivity?.followup_notes_logged ? styles.good : styles.bad]}>
              {proactivity?.followup_notes_logged ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.proactivityRow}>
            <Text style={styles.proactivityLabel}>Queue Participation (manual)</Text>
            <Text style={[styles.proactivityStatus, proactivity?.queue_participation ? styles.good : styles.bad]}>
              {proactivity?.queue_participation ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>

        {/* Discrepancy Alerts */}
        {alerts && alerts.length > 0 && (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Discrepancy Alerts ({alerts.length})</Text>
            {alerts.map((alert, i) => (
              <Text key={i} style={styles.alertItem}>• {alert.title}: {alert.detail}</Text>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>InsuredByCam — Confidential</Text>
          <Text style={styles.footerText}>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
}
