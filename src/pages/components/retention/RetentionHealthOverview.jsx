// RetentionHealthOverview — the principal's one-screen read of agency retention
// health. Ties book-level health (net retention %, PIF up/down from the monthly
// book-health upload) to the operational picture (save rate, premium saved vs
// at-risk, save velocity, terminations, escalations, parked cases), under a
// single green/amber/red status. Each tile jumps to its drill-down tab.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useBookSnapshots } from '../../../hooks/useBookMetrics';
import { useSaveVelocity } from '../../../hooks/useSaveVelocity';
import { useOpenEscalations } from '../../../hooks/useEscalations';
import { useQueueHygiene } from '../../../hooks/useQueueHygiene';
import { SAVE_METHOD_LABEL } from '../../../lib/saveMethods';

// Headline net-retention target. Below this (and a shrinking book) trips red.
const NET_RETENTION_TARGET = 0.85;

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
function fmtPct(r) {
  return r == null ? '—' : `${Math.round(r * 100)}%`;
}

function StatCard({ label, value, sub, color, accent, onClick }) {
  return (
    <div className="card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', position: 'relative',
        borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--qs-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>{sub}</div>}
      {onClick && (
        <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 11, color: 'var(--qs-muted)' }}>→</div>
      )}
    </div>
  );
}

export default function RetentionHealthOverview({ agencyId, kpis, onNavigate }) {
  const { data: book } = useBookSnapshots(agencyId);
  const { data: velocity } = useSaveVelocity(agencyId, 8);
  const { data: escalations = [] } = useOpenEscalations(agencyId);
  const { data: hygiene } = useQueueHygiene(agencyId, 7);

  const { data: parked = { total: 0, reSnoozed: 0 } } = useQuery({
    queryKey: ['parked_cases', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const head = (table, reSnoozed) => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true })
          .eq('agency_id', agencyId).gt('snoozed_until', nowIso);
        if (reSnoozed) q = q.gte('snooze_count', 2);
        return q;
      };
      const [pc, pcRe, rc, rcRe] = await Promise.all([
        head('pending_cases', false), head('pending_cases', true),
        head('renewal_cases', false), head('renewal_cases', true),
      ]);
      return {
        total: (pc.count || 0) + (rc.count || 0),
        reSnoozed: (pcRe.count || 0) + (rcRe.count || 0),
      };
    },
  });

  const totals = book?.totals || null;
  const netRet = totals?.blendedNetRetention ?? null;
  const pifVar = totals?.pifVariance ?? null;

  const preventable = hygiene?.lapsedUnworked ?? 0;

  // Overall status: book health (net retention vs target + book direction) is
  // the spine; a workflow leak (cases lapsing unworked) can't read green no
  // matter how the book looks. Missing book data → can't be green either.
  const status = (() => {
    // A preventable-lapse leak is a process failure — it outranks a clean book.
    if (preventable >= 5) return { key: 'red', color: '#EF4444', label: 'Workflow leaking',
      note: `${preventable} cases lapsed without ever being called — work the leak, not just the book.` };

    let s;
    if (netRet == null) s = { key: 'amber', color: '#F59E0B', label: 'Book data pending',
      note: 'Upload a book-health report to score net retention.' };
    else {
      const belowTarget = netRet < NET_RETENTION_TARGET;
      const shrinking = pifVar != null && pifVar < 0;
      if (belowTarget && shrinking) s = { key: 'red', color: '#EF4444', label: 'Needs attention',
        note: 'Net retention is below target and the book is shrinking.' };
      else if (belowTarget || shrinking) s = { key: 'amber', color: '#F59E0B', label: 'Watch',
        note: belowTarget ? 'Net retention is below target.' : 'The book is shrinking month-over-month.' };
      else s = { key: 'green', color: '#10B981', label: 'Healthy',
        note: 'Net retention is on target and the book is holding or growing.' };
    }
    // Any preventable lapse keeps it off green.
    if (preventable > 0 && s.key === 'green') {
      s = { key: 'amber', color: '#F59E0B', label: 'Watch',
        note: `${preventable} case${preventable === 1 ? '' : 's'} lapsed without ever being called.` };
    }
    return s;
  })();

  const trend = book?.trend || [];
  const maxNet = Math.max(0.0001, ...trend.map(t => t.netRetention || 0));

  const k = kpis || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Status banner */}
      <div style={{ borderRadius: 12, padding: 18, border: `1px solid ${status.color}55`,
        background: `${status.color}11`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: status.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: status.color }}>
            Retention health — {status.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 2 }}>{status.note}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: status.color, lineHeight: 1 }}>
            {fmtPct(netRet)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-muted)' }}>net retention · {Math.round(NET_RETENTION_TARGET * 100)}% target</div>
        </div>
      </div>

      {/* Workflow leaks — the leading process signal */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10 }}>Is the workflow catching cases in time?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <StatCard label="Preventable lapses"
            value={hygiene?.lapsedUnworked ?? '—'}
            sub="past deadline · never called"
            color={(hygiene?.lapsedUnworked ?? 0) > 0 ? '#EF4444' : '#10B981'}
            accent={(hygiene?.lapsedUnworked ?? 0) > 0 ? '#EF4444' : undefined}
            onClick={() => onNavigate?.('at_risk')} />
          <StatCard label="About to lapse, untouched"
            value={hygiene?.untouchedDueSoon ?? '—'}
            sub="due ≤7 days · never called"
            color={(hygiene?.untouchedDueSoon ?? 0) > 0 ? '#F59E0B' : '#10B981'}
            accent={(hygiene?.untouchedDueSoon ?? 0) > 0 ? '#F59E0B' : undefined}
            onClick={() => onNavigate?.('at_risk')} />
          <StatCard label="Lapsed — win-back open"
            value={hygiene?.lapsedTotal ?? '—'}
            sub="past deadline · still workable"
            onClick={() => onNavigate?.('at_risk')} />
          <StatCard label="Unassigned at-risk"
            value={hygiene?.unassignedAtRisk ?? '—'}
            sub="no owner"
            color={(hygiene?.unassignedAtRisk ?? 0) > 0 ? '#F59E0B' : 'var(--qs-dim)'}
            onClick={() => onNavigate?.('at_risk')} />
        </div>
        {(hygiene?.lapsedUnworked ?? 0) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 8 }}>
            These didn't lapse because they were hard — they lapsed because nobody worked them in time.
            Fix the leak first: work the win-back list, then call everything due this week before it joins them.
          </div>
        )}

        {/* Preventable-lapse trend — the number you want walking to zero */}
        {hygiene?.lapseTrend?.length > 1 && (() => {
          const maxLapse = Math.max(1, ...hygiene.lapseTrend.map(t => t.count));
          return (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-dim)', marginBottom: 8 }}>
                Preventable lapses per week — trending to zero?
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 64 }}>
                {hygiene.lapseTrend.map(t => (
                  <div key={t.week} title={`Week of ${t.week}: ${t.count} preventable`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.count ? '#F87171' : 'var(--qs-muted)' }}>
                      {t.count || ''}
                    </div>
                    <div style={{ width: '100%', maxWidth: 26,
                      height: Math.max(2, (t.count / maxLapse) * 40),
                      background: t.count ? '#EF4444' : 'var(--qs-elevated)', borderRadius: 3 }} />
                    <div style={{ fontSize: 9, color: 'var(--qs-muted)', fontFamily: "'DM Mono', monospace" }}>
                      {t.week.slice(5)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Book-level health */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10 }}>Book health {book?.latestMonth ? `· as of ${book.latestMonth}` : ''}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <StatCard label="Net Retention" value={fmtPct(netRet)}
            sub="rewrites counted as kept" color={netRet != null && netRet >= NET_RETENTION_TARGET ? '#10B981' : '#F59E0B'}
            accent={status.color} onClick={() => onNavigate?.('book')} />
          <StatCard label="Policy Retention" value={fmtPct(totals?.blendedRetention)}
            sub="excludes rewrites" onClick={() => onNavigate?.('book')} />
          <StatCard label="Policies in Force"
            value={totals?.pifCurrent != null ? totals.pifCurrent.toLocaleString() : '—'}
            sub={pifVar != null ? `${pifVar >= 0 ? '▲' : '▼'} ${Math.abs(pifVar).toLocaleString()} vs prior YE` : 'vs prior year-end'}
            color={pifVar == null ? undefined : pifVar >= 0 ? '#10B981' : '#F87171'}
            onClick={() => onNavigate?.('growth')} />
          <StatCard label="Net Retention trend"
            value={trend.length > 1 ? `${trend.length} mo` : '—'}
            sub="month-over-month"
            onClick={() => onNavigate?.('trends')} />
        </div>

        {/* Net retention sparkline */}
        {trend.length > 1 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
              {trend.map(t => (
                <div key={t.month} title={`${t.month}: ${fmtPct(t.netRetention)}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', maxWidth: 30,
                    height: Math.max(2, ((t.netRetention || 0) / maxNet) * 54),
                    background: (t.netRetention ?? 0) >= NET_RETENTION_TARGET ? '#10B981' : '#F59E0B',
                    borderRadius: 3 }} />
                  <div style={{ fontSize: 9, color: 'var(--qs-muted)' }}>{(t.month || '').slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Operational health */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10 }}>This period — outreach &amp; saves</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <StatCard label="Save Rate" value={k.saveRate != null ? fmtPct(k.saveRate) : '—'}
            sub="saved / worked" color="#10B981" onClick={() => onNavigate?.('at_risk')} />
          <StatCard label="Premium Saved" value={fmt$(k.premiumSaved)}
            sub={`vs ${fmt$(k.premiumAtRisk)} still at risk`} color="#10B981"
            onClick={() => onNavigate?.('at_risk')} />
          <StatCard label="Save Velocity" value={velocity ? `${velocity.totalSaves}` : '—'}
            sub={(() => {
              const recorded = (velocity?.methods || []).filter(m => m.method !== 'unrecorded');
              if (recorded.length === 0 || !velocity?.totalSaves) return 'saves · last 8 weeks';
              const top = recorded[0];
              const pct = Math.round((top.count / velocity.totalSaves) * 100);
              return `top: ${SAVE_METHOD_LABEL[top.method] || top.method} ${pct}%`;
            })()}
            color="#3B82F6" onClick={() => onNavigate?.('velocity')} />
          <StatCard label="Terminations" value={k.terminations ?? '—'}
            sub="requested cancel" onClick={() => onNavigate?.('attrition')} />
          <StatCard label="Open Escalations" value={escalations.length}
            sub="awaiting your decision"
            color={escalations.length > 0 ? '#F87171' : 'var(--qs-dim)'} />
          <StatCard label="Parked (snoozed)" value={parked.total}
            sub={parked.reSnoozed > 0 ? `${parked.reSnoozed} re-snoozed ≥2×` : 'deferred cases'}
            color={parked.reSnoozed > 0 ? '#F59E0B' : 'var(--qs-dim)'} />
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
        Net retention &amp; policies-in-force come from your monthly book-health upload; save metrics
        are this period's worked cases. Tiles open the full breakdown.
      </p>
    </div>
  );
}
