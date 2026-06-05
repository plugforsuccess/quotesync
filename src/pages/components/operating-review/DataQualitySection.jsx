// src/pages/components/operating-review/DataQualitySection.jsx
// Accountability KPI: what share of this month's terminations were logged with
// no real reason ("Insured Request — All Other"). Policy is to never use that
// default, so the target is 0% — this card makes compliance visible and trends
// it month over month.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

const sectionStyle = {
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  padding: 20,
};

function fmtMonth(d) {
  if (!d) return '';
  const [y, m] = d.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export default function DataQualitySection({ agencyId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['review_data_quality', agencyId],
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: cat } = await supabase
        .from('termination_reason_categories')
        .select('id')
        .eq('code', 'insured_request_unspecified')
        .single();
      const unspecId = cat?.id;

      const { data: rows, error } = await supabase
        .from('lapse_events')
        .select('report_month, termination_category_id')
        .eq('agency_id', agencyId);
      if (error) throw error;

      const byMonth = {};
      (rows || []).forEach((r) => {
        if (!r.report_month) return;
        byMonth[r.report_month] = byMonth[r.report_month] || { total: 0, unspec: 0 };
        byMonth[r.report_month].total += 1;
        if (r.termination_category_id === unspecId) byMonth[r.report_month].unspec += 1;
      });

      const months = Object.keys(byMonth).sort().reverse();
      const latest = months[0] ? { month: months[0], ...byMonth[months[0]] } : null;
      const prior = months[1] ? { month: months[1], ...byMonth[months[1]] } : null;
      return { latest, prior };
    },
  });

  if (isLoading || !data?.latest) return null;

  const { latest, prior } = data;
  const rate = latest.total > 0 ? (latest.unspec / latest.total) * 100 : 0;
  const priorRate = prior && prior.total > 0 ? (prior.unspec / prior.total) * 100 : null;
  const delta = priorRate != null ? rate - priorRate : null; // lower is better
  const onTarget = rate === 0;

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Data Quality</h2>
        <span style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>{fmtMonth(latest.month)} terminations</span>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--qs-subtle)', fontWeight: 600, marginBottom: 4 }}>
            Terminations with no reason recorded
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: onTarget ? 'var(--qs-success)' : 'var(--qs-danger)' }}>
              {rate.toFixed(0)}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--qs-dim)' }}>{latest.unspec} of {latest.total} · target 0%</span>
            {delta != null && delta !== 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: delta < 0 ? 'var(--qs-success)' : 'var(--qs-danger)' }}>
                {delta < 0 ? '▼' : '▲'} {Math.abs(delta).toFixed(0)} pts vs {fmtMonth(prior.month)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 12, lineHeight: 1.5 }}>
        These cancellations were coded <strong>"Insured Request — All Other"</strong> with no real reason captured.
        Policy is to never use that default — reps should record the true reason on every cancellation so retention
        analytics stay honest. {onTarget
          ? 'On target this month. ✓'
          : 'Every point here is churn you can’t learn from or win back.'}
      </div>
    </section>
  );
}
