// src/pages/components/retention/ElasticityCurveChart.jsx
// Visualizes the retention-elasticity curve: at each renewal premium-increase
// band, what share of the book actually stayed. The empirical proof behind
// "who to call first" — and, once calls are logged, the with/without-save lift.
import { T } from '../../../components/SiteCopy';
import { useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useChartTheme } from '../../../lib/chartTheme';
import { useElasticityCurve } from '../../../hooks/useElasticityCurve';

// Below this retention rate a band is flagged as a leak (amber/red).
const WATCH = 92;
const ALERT = 88;

function barColor(rate, ct) {
  if (rate == null) return ct.structural.axisTick;
  if (rate < ALERT) return '#EF4444';
  if (rate < WATCH) return '#F59E0B';
  return ct.data.green;
}

export default function ElasticityCurveChart({ agencyId }) {
  const { data, isLoading } = useElasticityCurve(agencyId);
  const ct = useChartTheme();

  const curve = data?.curve || [];
  const lift = data?.lift || [];

  const totals = useMemo(() => {
    const policies = curve.reduce((s, r) => s + (r.policies_resolved || 0), 0);
    const lost = curve.reduce((s, r) => s + (r.lost || 0), 0);
    const cliff = curve.find((r) => r.retention_rate_pct != null && r.retention_rate_pct < WATCH);
    return { policies, lost, cliff };
  }, [curve]);

  // Build the with/without-save comparison per band (only where both sides exist).
  const liftRows = useMemo(() => {
    const byBucket = {};
    for (const r of lift) {
      byBucket[r.bucket_order] = byBucket[r.bucket_order] || {};
      byBucket[r.bucket_order][r.had_intervention ? 'with' : 'without'] = r;
    }
    return Object.entries(byBucket)
      .map(([order, v]) => ({ order: Number(order), with: v.with, without: v.without }))
      .filter((b) => b.with && b.with.policies_resolved > 0)
      .sort((a, b) => a.order - b.order);
  }, [lift]);

  const yFloor = useMemo(() => {
    const rates = curve.map((r) => r.retention_rate_pct).filter((v) => v != null);
    if (rates.length === 0) return 70;
    return Math.max(0, Math.floor((Math.min(...rates) - 6) / 5) * 5);
  }, [curve]);

  if (isLoading) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13, padding: 16 }}><T k="pages.components.retention.elasticitycurvechart.66333a">Loading elasticity curve…</T></div>;
  }

  if (curve.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13, color: 'var(--qs-subtle)' }}>
        <strong style={{ color: 'var(--qs-bright)' }}><T k="pages.components.retention.elasticitycurvechart.c5ff45">Rate-increase elasticity</T></strong>
        <div style={{ marginTop: 6 }}>
          <T k="pages.components.retention.elasticitycurvechart.007b00">No resolved renewals with a recorded premium change yet. This curve builds as renewals resolve — it shows how much rate increase your book tolerates before customers leave.</T>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
        <T k="pages.components.retention.elasticitycurvechart.fb849a">Rate-increase elasticity — does the book tolerate the increase?</T>
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 12 }}>
        <T k="pages.components.retention.elasticitycurvechart.e67adc">Of resolved renewals in each premium-increase band, the share that stayed.</T>
        {totals.cliff
          ? <> <T k="pages.components.retention.elasticitycurvechart.7a4745">Retention holds until</T> <strong style={{ color: 'var(--qs-bright)' }}>{totals.cliff.change_bucket}</strong><T k="pages.components.retention.elasticitycurvechart.94ed3c">, where it drops to</T> <strong style={{ color: '#F59E0B' }}>{totals.cliff.retention_rate_pct}%</strong> <T k="pages.components.retention.elasticitycurvechart.f47212">— call those first.</T></>
          : ' Retention is holding across all bands so far.'}
        <span style={{ color: 'var(--qs-dim)' }}> · {totals.policies} <T k="pages.components.retention.elasticitycurvechart.f187f7">resolved renewals · early signal, sharpens with each cycle.</T></span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={curve} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.structural.grid} vertical={false} />
          <XAxis dataKey="change_bucket" tick={{ fontSize: 11, fill: ct.structural.axisTick }} />
          <YAxis domain={[yFloor, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: ct.structural.axisTick }} />
          <Tooltip
            contentStyle={ct.tooltipStyle}
            labelStyle={ct.tooltipLabelStyle}
            formatter={(v, _n, p) => [
              `${v}% stayed (${p.payload.retained}/${p.payload.policies_resolved})`,
              'Retention',
            ]}
            labelFormatter={(l) => `Premium change: ${l}`}
          />
          <ReferenceLine y={WATCH} stroke={ct.structural.axisTick} strokeDasharray="4 4"
            label={{ value: `${WATCH}%`, fontSize: 10, fill: ct.structural.axisTick, position: 'right' }} />
          <Bar dataKey="retention_rate_pct" radius={[4, 4, 0, 0]}>
            {curve.map((r) => <Cell key={r.bucket_order} fill={barColor(r.retention_rate_pct, ct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Save-call lift — the ROI line, once interventions are being logged. */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--qs-border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 6 }}>
          <T k="pages.components.retention.elasticitycurvechart.007aa2">Save-call lift</T>
        </div>
        {liftRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
            <T k="pages.components.retention.elasticitycurvechart.66e059">Appears here once reps log save tactics on calls — it will show retention</T>
            <em> <T k="pages.components.retention.elasticitycurvechart.23a58b">with</T></em> <T k="pages.components.retention.elasticitycurvechart.f4842d">vs</T> <em><T k="pages.components.retention.elasticitycurvechart.fc0cb4">without</T></em> <T k="pages.components.retention.elasticitycurvechart.4f8126">a save call in each band (the ROI proof).</T>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {liftRows.map((b) => {
              const w = b.with?.retention_rate_pct;
              const wo = b.without?.retention_rate_pct;
              const delta = (w != null && wo != null) ? Math.round((w - wo) * 10) / 10 : null;
              return (
                <div key={b.order} style={{
                  background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                  borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 150,
                }}>
                  <div style={{ color: 'var(--qs-subtle)' }}>{b.with.change_bucket ?? b.without?.change_bucket}</div>
                  <div style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>
                    {w != null ? `${w}%` : '—'} <T k="pages.components.retention.elasticitycurvechart.205bf1">with ·</T> {wo != null ? `${wo}%` : '—'} <T k="pages.components.retention.elasticitycurvechart.fc0cb4">without</T>
                  </div>
                  {delta != null && (
                    <div style={{ color: delta >= 0 ? 'var(--qs-success, #10B981)' : '#EF4444' }}>
                      {delta >= 0 ? '+' : ''}{delta} <T k="pages.components.retention.elasticitycurvechart.085275">pts from a save call</T>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
