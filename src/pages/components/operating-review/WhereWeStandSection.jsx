// src/pages/components/operating-review/WhereWeStandSection.jsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { queryKeys } from '../../../lib/queryKeys';
import { useAllProducerConfigs } from '../../../hooks/useProducerCompModel';
import { toSunday, toPriorMonday } from '../../../lib/weekUtils';

const CANCEL_TERMINAL = ['saved','lost','auto_resolved','cancelled','requested_cancellation','rewritten'];

const sectionStyle = {
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  padding: 20,
};

const cardStyle = {
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 110,
};

const cardLabelStyle = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--qs-subtle)',
  fontWeight: 600,
};

const cardValueStyle = {
  fontSize: 28,
  fontWeight: 700,
  color: 'var(--qs-bright)',
  lineHeight: 1,
};

const cardDeltaStyle = (delta) => ({
  fontSize: 13,
  fontWeight: 500,
  color: delta > 0 ? 'var(--qs-success)' : delta < 0 ? 'var(--qs-danger)' : 'var(--qs-subtle)',
});

const cardSublineStyle = {
  fontSize: 12,
  color: 'var(--qs-dim)',
};

export default function WhereWeStandSection({ agencyId, reviewWeekStart, priorWeekStart }) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: queryKeys.operatingReview.whereWeStand(agencyId, reviewWeekStart),
    queryFn: () => fetchSnapshot(agencyId, reviewWeekStart, priorWeekStart),
    enabled: !!agencyId && !!reviewWeekStart,
    staleTime: 60 * 1000,
  });

  const { data: producerConfigs = [] } = useAllProducerConfigs(agencyId);
  const activeProducerCount = producerConfigs.length;

  const cards = useMemo(() => {
    if (!snapshot) return null;
    return buildCards(snapshot, activeProducerCount);
  }, [snapshot, activeProducerCount]);

  return (
    <section style={sectionStyle}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--qs-bright)', margin: 0 }}>
          Where we stand
        </h2>
        <p style={{ fontSize: 13, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 0 }}>
          Snapshot of the agency right now, with deltas vs. the prior week.
        </p>
      </header>

      {isLoading || !cards ? (
        <div style={{ color: 'var(--qs-subtle)', padding: 16 }}>Loading snapshot…</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {cards.map((c) => (
            <StatCard key={c.label} {...c} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, delta, deltaLabel, subline }) {
  const hasDelta = delta != null;
  return (
    <div style={cardStyle}>
      <div style={cardLabelStyle}>{label}</div>
      <div style={cardValueStyle}>{value}</div>
      {hasDelta && (
        <div style={cardDeltaStyle(delta)}>
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {deltaLabel}
        </div>
      )}
      {subline && <div style={cardSublineStyle}>{subline}</div>}
    </div>
  );
}

// ── Data fetcher ──────────────────────────────────────────────────────────

async function fetchSnapshot(agencyId, reviewWeekStart, priorWeekStart) {
  // Date ranges
  const priorWeekEnd = toSunday(priorWeekStart);
  const weekBeforePrior = toPriorMonday(priorWeekStart);
  const weekBeforePriorEnd = toSunday(weekBeforePrior);

  const reviewWeekEnd = toSunday(reviewWeekStart);

  const thirtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const sixtyDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d.toISOString().slice(0, 10);
  })();

  const [
    { data: lastWeekNB, error: e1 },
    { data: weekBeforeNB, error: e2 },
    { data: thisWeekRenewals, error: e3 },
    { data: priorWeekRenewals, error: e4 },
    { data: activeCancels, error: e5 },
    { data: lastWeekLeads, error: e6 },
    { data: weekBeforeLeads, error: e7 },
    { data: recentCases, error: e8 },
    { data: priorMonthCases, error: e9 },
  ] = await Promise.all([
    supabase.from('revenue_entries').select('policy_count, premium')
      .eq('agency_id', agencyId)
      .gte('issued_date', priorWeekStart).lte('issued_date', priorWeekEnd),

    supabase.from('revenue_entries').select('policy_count, premium')
      .eq('agency_id', agencyId)
      .gte('issued_date', weekBeforePrior).lte('issued_date', weekBeforePriorEnd),

    supabase.from('renewal_cases').select('id, premium')
      .eq('agency_id', agencyId)
      .gte('renewal_date', reviewWeekStart).lte('renewal_date', reviewWeekEnd),

    supabase.from('renewal_cases').select('id, premium')
      .eq('agency_id', agencyId)
      .gte('renewal_date', priorWeekStart).lte('renewal_date', priorWeekEnd),

    supabase.from('pending_cases').select('id, status, priority_tier')
      .eq('agency_id', agencyId)
      .not('status', 'in', `(${CANCEL_TERMINAL.map(s => `"${s}"`).join(',')})`),

    supabase.from('leads').select('id')
      .eq('agency_id', agencyId)
      .gte('created_at', priorWeekStart + 'T00:00:00Z')
      .lte('created_at', priorWeekEnd + 'T23:59:59Z'),

    supabase.from('leads').select('id')
      .eq('agency_id', agencyId)
      .gte('created_at', weekBeforePrior + 'T00:00:00Z')
      .lte('created_at', weekBeforePriorEnd + 'T23:59:59Z'),

    supabase.from('pending_cases').select('status, resolution_date')
      .eq('agency_id', agencyId)
      .gte('resolution_date', thirtyDaysAgo)
      .in('status', CANCEL_TERMINAL),

    supabase.from('pending_cases').select('status, resolution_date')
      .eq('agency_id', agencyId)
      .gte('resolution_date', sixtyDaysAgo)
      .lt('resolution_date', thirtyDaysAgo)
      .in('status', CANCEL_TERMINAL),
  ]);

  const firstError = [e1, e2, e3, e4, e5, e6, e7, e8, e9].find(Boolean);
  if (firstError) throw firstError;

  return {
    lastWeekNB:           sumPolicyCount(lastWeekNB),
    weekBeforeNB:         sumPolicyCount(weekBeforeNB),
    thisWeekRenewals:     (thisWeekRenewals ?? []).length,
    priorWeekRenewals:    (priorWeekRenewals ?? []).length,
    activeCancels:        (activeCancels ?? []).length,
    activeCancelsP0P1:    (activeCancels ?? []).filter(c => c.priority_tier === 'P0' || c.priority_tier === 'P1').length,
    lastWeekLeads:        (lastWeekLeads ?? []).length,
    weekBeforeLeads:      (weekBeforeLeads ?? []).length,
    recentCasesTotal:     (recentCases ?? []).length,
    recentCasesSaved:     (recentCases ?? []).filter(c => c.status === 'saved').length,
    priorCasesTotal:      (priorMonthCases ?? []).length,
    priorCasesSaved:      (priorMonthCases ?? []).filter(c => c.status === 'saved').length,
  };
}

function sumPolicyCount(rows) {
  return (rows ?? []).reduce((s, r) => s + (Number(r.policy_count) || 0), 0);
}

function pctChange(current, prior) {
  if (!prior || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function deltaLabel(current, prior, unit = '') {
  if (prior == null || prior === 0) return 'no prior data';
  const delta = current - prior;
  const pct = pctChange(current, prior);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${unit} (${sign}${pct.toFixed(0)}%)`;
}

// ── Card construction ─────────────────────────────────────────────────────

function buildCards(s, activeProducerCount) {
  const saveRate = s.recentCasesTotal > 0
    ? Math.round((s.recentCasesSaved / s.recentCasesTotal) * 100)
    : null;
  const priorSaveRate = s.priorCasesTotal > 0
    ? Math.round((s.priorCasesSaved / s.priorCasesTotal) * 100)
    : null;

  const throughputLastWeek = activeProducerCount > 0
    ? (s.lastWeekNB / activeProducerCount).toFixed(1)
    : '0';
  const throughputWeekBefore = activeProducerCount > 0
    ? (s.weekBeforeNB / activeProducerCount).toFixed(1)
    : '0';

  return [
    {
      label: "Last week's NB",
      value: s.lastWeekNB,
      delta: s.lastWeekNB - s.weekBeforeNB,
      deltaLabel: deltaLabel(s.lastWeekNB, s.weekBeforeNB, ' items'),
      subline: 'Sum of policy_count, Mon–Sun',
    },
    {
      label: 'Renewals this week',
      value: s.thisWeekRenewals,
      delta: s.thisWeekRenewals - s.priorWeekRenewals,
      deltaLabel: deltaLabel(s.thisWeekRenewals, s.priorWeekRenewals, ''),
      subline: 'Renewal_date in current week',
    },
    {
      label: 'Pending cancels active',
      value: s.activeCancels,
      delta: null,
      deltaLabel: null,
      subline: `${s.activeCancelsP0P1} P0/P1 urgent`,
    },
    {
      label: 'Producer throughput',
      value: throughputLastWeek,
      delta: parseFloat(throughputLastWeek) - parseFloat(throughputWeekBefore),
      deltaLabel: deltaLabel(
        parseFloat(throughputLastWeek),
        parseFloat(throughputWeekBefore),
        ''
      ),
      subline: `Items/producer · ${activeProducerCount} active`,
    },
    {
      label: 'Lead flow',
      value: s.lastWeekLeads,
      delta: s.lastWeekLeads - s.weekBeforeLeads,
      deltaLabel: deltaLabel(s.lastWeekLeads, s.weekBeforeLeads, ' leads'),
      subline: 'New leads, prior week',
    },
    {
      label: 'Save rate (30d)',
      value: saveRate != null ? `${saveRate}%` : '—',
      delta: saveRate != null && priorSaveRate != null ? saveRate - priorSaveRate : null,
      deltaLabel:
        saveRate != null && priorSaveRate != null
          ? `${saveRate - priorSaveRate >= 0 ? '+' : ''}${saveRate - priorSaveRate}pp vs prior 30d`
          : 'no prior data',
      subline: `${s.recentCasesSaved} saved / ${s.recentCasesTotal} resolved`,
    },
  ];
}
