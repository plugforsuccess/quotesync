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

  // Overall status: book health (net retention vs target + book direction) is
  // the spine; operational risk nudges it. Missing book data → can't be green.
  const status = (() => {
    if (netRet == null) return { key: 'amber', color: '#F59E0B', label: 'Book data pending',
      note: 'Upload a book-health report to score net retention.' };
    const belowTarget = netRet < NET_RETENTION_TARGET;
    const shrinking = pifVar != null && pifVar < 0;
    if (belowTarget && shrinking) return { key: 'red', color: '#EF4444', label: 'Needs attention',
      note: 'Net retention is below target and the book is shrinking.' };
    if (belowTarget || shrinking) return { key: 'amber', color: '#F59E0B', label: 'Watch',
      note: belowTarget ? 'Net retention is below target.' : 'The book is shrinking month-over-month.' };
    return { key: 'green', color: '#10B981', label: 'Healthy',
      note: 'Net retention is on target and the book is holding or growing.' };
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
            sub="saves · last 8 weeks" color="#3B82F6" onClick={() => onNavigate?.('velocity')} />
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
