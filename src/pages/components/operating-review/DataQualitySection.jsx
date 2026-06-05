// src/pages/components/operating-review/DataQualitySection.jsx
// Accountability KPI: what share of terminations were logged with no real
// reason ("Insured Request — All Other"). Policy is to never use that default,
// so the target is 0%. Shows the pre-SOP baseline vs. the clean SOP era
// (measured from the agency's go-live date) so the improvement is provable.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useSopGoLiveDate } from '../../../hooks/useSopGoLiveDate';

const sectionStyle = {
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  padding: 20,
};

function fmtMonth(d) {
  if (!d) return '';
  const [y, m] = String(d).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function Stat({ label, rate, sample, tone }) {
  const color = rate == null
    ? 'var(--qs-dim)'
    : tone === 'baseline'
    ? 'var(--qs-subtle)'
    : rate === 0 ? 'var(--qs-success)' : 'var(--qs-danger)';
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--qs-subtle)', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color }}>
          {rate == null ? '—' : `${rate.toFixed(0)}%`}
        </span>
        <span style={{ fontSize: 12, color: 'var(--qs-dim)' }}>{sample}</span>
      </div>
    </div>
  );
}

export default function DataQualitySection({ agencyId }) {
  const { data: goLive } = useSopGoLiveDate(agencyId);

  const { data, isLoading } = useQuery({
    queryKey: ['review_data_quality', agencyId, goLive],
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

      const split = { baseline: { total: 0, unspec: 0 }, era: { total: 0, unspec: 0 } };
      (rows || []).forEach((r) => {
        if (!r.report_month) return;
        const bucket = (goLive && String(r.report_month) >= goLive) ? 'era' : 'baseline';
        split[bucket].total += 1;
        if (r.termination_category_id === unspecId) split[bucket].unspec += 1;
      });
      return split;
    },
  });

  if (isLoading || !data) return null;

  const rate = (b) => (b.total > 0 ? (b.unspec / b.total) * 100 : null);
  const baselineRate = rate(data.baseline);
  const eraRate = rate(data.era);
  const goLiveFuture = goLive && goLive > new Date().toISOString().slice(0, 10);
  const improvement = (baselineRate != null && eraRate != null) ? baselineRate - eraRate : null;

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Data Quality</h2>
        <span style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
          Terminations with no reason recorded · target 0%
        </span>
      </div>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Stat
          label={`Baseline (before ${fmtMonth(goLive) || 'SOP'})`}
          rate={baselineRate}
          sample={`${data.baseline.unspec} of ${data.baseline.total}`}
          tone="baseline"
        />
        <Stat
          label={`Since SOP launch${goLive ? ` (${fmtMonth(goLive)})` : ''}`}
          rate={eraRate}
          sample={
            data.era.total > 0
              ? `${data.era.unspec} of ${data.era.total}`
              : goLiveFuture ? 'tracking begins ' + fmtMonth(goLive) : 'no data yet'
          }
          tone="era"
        />
        {improvement != null && improvement !== 0 && (
          <div style={{ alignSelf: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: improvement > 0 ? 'var(--qs-success)' : 'var(--qs-danger)' }}>
              {improvement > 0 ? '▼' : '▲'} {Math.abs(improvement).toFixed(0)} pts {improvement > 0 ? 'improved' : 'worse'}
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 14, lineHeight: 1.5 }}>
        These cancellations were coded <strong>"Insured Request — All Other"</strong> with no real reason captured.
        SOP: never use that default — reps record the true reason on every cancellation. The baseline stays as your
        before; this number should fall to zero in the SOP era.
      </div>
    </section>
  );
}
