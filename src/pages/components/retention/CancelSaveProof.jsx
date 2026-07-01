// CancelSaveProof — the cancel-side proof block, rendered under the renewal
// lift on the same screen. Its whole job is to stop routine non-payment cures
// from reading as heroic saves: it shows premium KEPT IN FORCE (gross) next to
// premium RESCUED ABOVE BASELINE (desk-attributable), and exposes the per-cycle
// cure baseline that separates the two. Reporting-only — nothing changes for
// the rep.

import { useCancelSaveProof } from '../../../hooks/useCancelSaveProof';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
const fmtPct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);

export default function CancelSaveProof({ agencyId }) {
  const { data, isLoading } = useCancelSaveProof(agencyId);
  if (isLoading || !data) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading cancel-save proof…</div>;
  }

  const { worked, inboundOnly, autoCured, keptInForcePremium, rescuedPremium, byCycle } = data;
  const attributedShare =
    keptInForcePremium > 0 ? rescuedPremium / keptInForcePremium : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--qs-text)' }}>
          Pending cancellations — kept in force vs. genuinely rescued
        </div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 4, maxWidth: 760 }}>
          Non-payment cancels are the softer half of the book — many cure on their own. So a saved
          cancel's full premium isn't all desk-driven. This splits the premium you keep in force from
          the slice actually rescued above the rate these would have cured untouched.
        </div>
      </div>

      {/* Two headline numbers */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="card" style={{ borderLeft: '3px solid #6B7280', flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 600, marginBottom: 6 }}>
            Premium kept in force
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--qs-text)', lineHeight: 1.05 }}>
            {fmt$(keptInForcePremium)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 3 }}>
            gross premium on worked cancel saves · {worked.kept}/{worked.resolved} resolved kept
          </div>
        </div>
        <div className="card" style={{ borderLeft: '3px solid #10B981', flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 600, marginBottom: 6 }}>
            Premium rescued above baseline
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#10B981', lineHeight: 1.05 }}>
            {fmt$(rescuedPremium)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 3 }}>
            desk-attributable · {attributedShare == null ? '—' : `${Math.round(attributedShare * 100)}% of kept-in-force`}
          </div>
        </div>
      </div>

      {/* Per-cycle cure baseline — the engine behind the attribution */}
      {byCycle.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10 }}>Cure baseline by cycle · worked vs. left alone</div>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
            <div style={{ color: 'var(--qs-subtle)', fontWeight: 600 }}>Cycle</div>
            <div style={{ color: 'var(--qs-subtle)', fontWeight: 600 }}>Baseline cure</div>
            <div style={{ color: 'var(--qs-subtle)', fontWeight: 600 }}>Worked cure</div>
            <div style={{ color: 'var(--qs-subtle)', fontWeight: 600 }}>Lift</div>
            {byCycle.map((r) => (
              <Row key={r.cycle} r={r} />
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--qs-muted)', marginTop: 10 }}>
            Baseline = share of cancels that cured with <em>no</em> proactive outreach (incl. auto-cleared),
            per repeat-cancel cycle. Higher cycles cure less on their own, so a worked save there earns
            more credit. The lift is what the desk added over "would've paid anyway."
          </div>
        </div>
      )}

      {/* Excluded cohorts — same honesty guards as the renewal lift */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="card" style={{ borderLeft: '3px solid #F59E0B', flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
            {autoCured.cases.toLocaleString()} auto-cured ({fmt$(autoCured.premium)}) excluded
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
            Cleared with no logged reached call — the customer simply paid. Kept in force, but not a
            rep save, so they sit outside the numbers above.
          </div>
        </div>
        {inboundOnly.cases > 0 && (
          <div className="card" style={{ borderLeft: '3px solid #60A5FA', flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', marginBottom: 4 }}>
              {inboundOnly.cases.toLocaleString()} inbound-only ({fmt$(inboundOnly.premiumKept)} kept)
            </div>
            <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
              The customer called us. Handled, but not proactive outreach — kept out of the worked cohort.
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
        "Worked" = at least one genuine (non-auto-logged) outbound attempt. Per-cycle baselines are
        directional until volume grows. Nothing here changes how a rep records a save.
      </p>
    </div>
  );
}

function Row({ r }) {
  const liftColor = r.liftPts == null ? 'var(--qs-dim)' : r.liftPts > 0 ? '#10B981' : '#F87171';
  return (
    <>
      <div style={{ color: 'var(--qs-text)', fontWeight: 700 }}>#{r.cycle}</div>
      <div style={{ color: 'var(--qs-dim)' }}>
        {fmtPct(r.baseline.cureRate)} <span style={{ color: 'var(--qs-muted)' }}>({r.baseline.kept}/{r.baseline.resolved})</span>
      </div>
      <div style={{ color: 'var(--qs-text)' }}>
        {fmtPct(r.worked.cureRate)} <span style={{ color: 'var(--qs-muted)' }}>({r.worked.kept}/{r.worked.resolved})</span>
      </div>
      <div style={{ color: liftColor, fontWeight: 700 }}>
        {r.liftPts == null ? '—' : `${r.liftPts >= 0 ? '+' : ''}${Math.round(r.liftPts)} pts`}
      </div>
    </>
  );
}
