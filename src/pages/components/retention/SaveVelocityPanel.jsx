// SaveVelocityPanel — the pace of saving, per week + per rep. Answers "how fast
// is she saving, and is it speeding up or slowing down?" rather than a lifetime
// rate. Cancel saves (amber) + confirmed renewals (blue), bucketed by the week
// each case closed, with a per-rep rollup and a recent-vs-prior trend arrow.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useSaveVelocity } from '../../../hooks/useSaveVelocity';
import { SAVE_METHOD_LABEL } from '../../../lib/saveMethods';

function methodLabel(m) {
  return m === 'unrecorded' ? 'Not recorded' : (SAVE_METHOD_LABEL[m] || m);
}

// Compact labels for the per-rep chips (full labels are too long in a cell).
const METHOD_SHORT = {
  company_transfer: 'Transfer', paid_past_due: 'Paid due', requote: 'Re-quote', bundle: 'Bundle',
  discount: 'Discount', competitor_match: 'Held vs comp', payment_plan: 'Pay plan',
  reinstatement: 'Reinstate', rewrite: 'Rewrite', explained_increase: 'Explained',
  retention_offer: 'Retention', other: 'Other', unrecorded: '—',
};
function methodShort(m) { return METHOD_SHORT[m] || methodLabel(m); }

// A rep's save methods as ranked chips — who leans on transfers vs. discounts.
function RepMethodChips({ methods }) {
  const entries = Object.entries(methods || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span style={{ color: 'var(--qs-muted)' }}>—</span>;
  const shown = entries.slice(0, 3);
  const extra = entries.length - shown.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {shown.map(([m, n]) => {
        const transfer = m === 'company_transfer';
        const unrec = m === 'unrecorded';
        return (
          <span key={m} style={{
            fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
            background: transfer ? 'rgba(139,92,246,0.15)' : unrec ? 'var(--qs-elevated)' : 'rgba(16,185,129,0.12)',
            color: transfer ? '#A78BFA' : unrec ? 'var(--qs-muted)' : '#34D399',
            whiteSpace: 'nowrap',
          }}>
            {methodShort(m)} {n}
          </span>
        );
      })}
      {extra > 0 && <span style={{ fontSize: 11, color: 'var(--qs-muted)' }}>+{extra}</span>}
    </div>
  );
}

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
function weekLabel(k) {
  const d = new Date(k + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

export default function SaveVelocityPanel({ agencyId }) {
  const { data, isLoading } = useSaveVelocity(agencyId, 8);

  const { data: empMap = {} } = useQuery({
    queryKey: ['velocity_emp_names', agencyId],
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name')
        .eq('org_id', agencyId);
      const m = {};
      for (const e of emps || []) {
        m[e.id] = e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim();
      }
      return m;
    },
  });

  if (isLoading) {
    return <div className="card" style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading save velocity…</div>;
  }
  if (!data) return null;

  const { series, reps, methods = [], totalSaves, totalPremium } = data;
  const maxSaves = Math.max(1, ...series.map(w => w.cancelSaves + w.renewalSaves));
  const maxMethod = Math.max(1, ...methods.map(m => m.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>
            Save velocity — last 8 weeks
          </h3>
          <div style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
            <strong style={{ color: '#10B981' }}>{totalSaves}</strong> saves ·{' '}
            <strong style={{ color: '#10B981' }}>{fmt$(totalPremium)}</strong> premium preserved
          </div>
        </div>

        {/* Weekly bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 160, marginTop: 20, paddingBottom: 4 }}>
          {series.map(w => {
            const total = w.cancelSaves + w.renewalSaves;
            const h = (total / maxSaves) * 120;
            const cancelH = total ? (w.cancelSaves / total) * h : 0;
            const renewalH = total ? (w.renewalSaves / total) * h : 0;
            return (
              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: total ? 'var(--qs-text)' : 'var(--qs-muted)' }}>
                  {total || ''}
                </div>
                <div title={`${w.cancelSaves} cancel saves · ${w.renewalSaves} renewals · ${fmt$(w.premium)}`}
                  style={{ width: '100%', maxWidth: 36, height: Math.max(h, 2), borderRadius: 4, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    background: total ? 'transparent' : 'var(--qs-elevated)' }}>
                  {renewalH > 0 && <div style={{ height: renewalH, background: '#3B82F6' }} />}
                  {cancelH > 0 && <div style={{ height: cancelH, background: '#F59E0B' }} />}
                </div>
                <div style={{ fontSize: 10, color: 'var(--qs-muted)', fontFamily: "'DM Mono', monospace" }}>
                  {weekLabel(w.week)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--qs-muted)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#F59E0B', borderRadius: 2, marginRight: 4 }} />Cancel saves</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#3B82F6', borderRadius: 2, marginRight: 4 }} />Confirmed renewals</span>
        </div>
      </div>

      {/* By save method — "how did we keep them?" */}
      <div className="card">
        <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)', margin: '0 0 12px' }}>
          By save method (8-week window)
        </h4>
        {methods.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--qs-muted)' }}>No saves recorded in the window yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {methods.map(m => {
              const pct = totalSaves > 0 ? Math.round((m.count / totalSaves) * 100) : 0;
              const isTransfer = m.method === 'company_transfer';
              const unrecorded = m.method === 'unrecorded';
              const barColor = unrecorded ? 'var(--qs-muted)' : isTransfer ? '#8B5CF6' : '#10B981';
              return (
                <div key={m.method} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 170, flexShrink: 0, fontSize: 13,
                    fontWeight: isTransfer ? 700 : 500,
                    color: unrecorded ? 'var(--qs-muted)' : 'var(--qs-text)' }}>
                    {methodLabel(m.method)}
                  </div>
                  <div style={{ flex: 1, height: 18, background: 'var(--qs-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(m.count / maxMethod) * 100}%`, height: '100%',
                      background: barColor, borderRadius: 4, minWidth: 2 }} />
                  </div>
                  <div style={{ width: 110, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--qs-dim)' }}>
                    <strong style={{ color: 'var(--qs-text)' }}>{m.count}</strong> · {pct}% · {fmt$(m.premium)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
          The tactic captured when each case was saved. "Not recorded" = saved before a method was selected.
        </p>
      </div>

      {/* Per-rep rollup */}
      <div className="card">
        <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)', margin: '0 0 12px' }}>
          By rep (8-week window)
        </h4>
        {reps.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--qs-muted)' }}>No saves recorded in the window yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Rep</th><th>Saves</th><th>Cancel</th><th>Renewal</th><th>Premium</th><th>Methods</th><th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {reps.map(r => {
                const total = r.cancelSaves + r.renewalSaves;
                const trend = r.recent - r.prior;
                const trendColor = trend > 0 ? '#10B981' : trend < 0 ? '#F87171' : 'var(--qs-muted)';
                const trendArrow = trend > 0 ? '▲' : trend < 0 ? '▼' : '–';
                return (
                  <tr key={r.empId || 'unassigned'}>
                    <td style={{ fontWeight: 600 }}>{empMap[r.empId] || 'Unattributed'}</td>
                    <td style={{ fontWeight: 700, color: '#10B981' }}>{total}</td>
                    <td>{r.cancelSaves}</td>
                    <td>{r.renewalSaves}</td>
                    <td>{fmt$(r.premium)}</td>
                    <td><RepMethodChips methods={r.methods} /></td>
                    <td style={{ color: trendColor, fontWeight: 600 }}>
                      {trendArrow} {Math.abs(trend)} {trend >= 0 ? 'vs prior 4wk' : 'vs prior 4wk'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
          Trend compares the most recent 4 weeks against the prior 4. Saves are attributed to whoever closed the case.
          Methods shows each rep's top save tactics (Transfer highlighted) — useful for coaching who leans where.
        </p>
      </div>
    </div>
  );
}
