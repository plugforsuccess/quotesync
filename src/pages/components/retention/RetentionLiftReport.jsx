// RetentionLiftReport — the proof screen. Answers the one question that turns a
// call list into a defensible product: do the renewals the desk actually worked
// retain better than the ones it never touched? Built to be honest enough to put
// in front of a carrier — it quarantines inferred (easy-pay) saves, states the
// cohort sizes, and flags selection bias when the worked cohort had an easier
// rate environment. Screenshot-ready.

import { useRetentionLift } from '../../../hooks/useRetentionLift';
import { useTacticCaptureRate } from '../../../hooks/useTacticCaptureRate';
import { useProofReadiness } from '../../../hooks/useProofReadiness';
import { useActiveEmployees } from '../../../hooks/useEmployees';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
const fmtPct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);
const fmtRate = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

function CohortCard({ title, c, accent, highlight }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${accent}`, flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: highlight ? accent : 'var(--qs-text)', lineHeight: 1.05 }}>
        {fmtPct(c.retainRate)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 3 }}>
        renewed · {c.confirmed}/{c.resolved} resolved
      </div>
      <div style={{ height: 1, background: 'var(--qs-border)', margin: '10px 0' }} />
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Premium retained</span><strong style={{ color: 'var(--qs-text)' }}>{fmt$(c.premiumRetained)}</strong>
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span>Avg rate increase</span><strong style={{ color: 'var(--qs-text)' }}>{fmtRate(c.avgRateChange)}</strong>
      </div>
    </div>
  );
}

function ReadyRow({ ok, label, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, marginBottom: 6 }}>
      <span style={{ color: ok ? '#10B981' : '#F59E0B', fontWeight: 700 }}>{ok ? '✓' : '⏳'}</span>
      <span style={{ color: 'var(--qs-text)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--qs-dim)' }}>{detail}</span>
    </div>
  );
}

function ProofReadiness({ agencyId, capture }) {
  const { data: r } = useProofReadiness(agencyId);
  const { data: employees = [] } = useActiveEmployees(agencyId);
  if (!r) return null;

  const nameOf = (empId) => {
    const e = employees.find((x) => x.id === empId);
    return e ? (e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()) : 'Unknown rep';
  };

  // Use recent capture (current behavior) for the gate; fall back to overall.
  const recentRate = capture?.recent?.captureRate ?? capture?.captureRate ?? null;
  const captureOk = recentRate != null && recentRate >= 0.8;
  const ready = captureOk && r.sampleReady;

  return (
    <div className="card" style={{ borderLeft: `3px solid ${ready ? '#10B981' : '#6B7280'}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 4 }}>Build readiness · per-rep tactic save-rate view</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: ready ? '#10B981' : 'var(--qs-text)', marginBottom: 10 }}>
        {ready ? 'Ready to build — the data can support it' : 'Not yet — keep capturing'}
      </div>

      <ReadyRow ok={captureOk}
        label="Capture reliable"
        detail={recentRate == null
          ? 'no reached calls in the last 30 days yet'
          : `${Math.round(recentRate * 100)}% of recent reached calls tagged a tactic · needs ≥80%`} />
      <ReadyRow ok={r.sampleReady}
        label="Sample per rep"
        detail={`top rep has ${r.topRepCount}/${r.minSample} tactic-bearing resolved renewals`} />

      {r.perRep.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {r.perRep.slice(0, 4).map((row) => (
            <span key={row.empId} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
              border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)', color: 'var(--qs-dim)' }}>
              {nameOf(row.empId)} <strong style={{ color: 'var(--qs-text)' }}>{row.count}/{r.minSample}</strong>
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--qs-muted)', marginTop: 10 }}>
        {ready
          ? 'Both gates are green: the per-rep, per-tactic save-rate grid is worth building now.'
          : 'When both rows turn green, the per-rep, per-tactic save-rate grid becomes a small build — this is the number to watch instead of guessing the timing.'}
      </div>
    </div>
  );
}

export default function RetentionLiftReport({ agencyId }) {
  const { data, isLoading } = useRetentionLift(agencyId);
  const { data: capture } = useTacticCaptureRate(agencyId);

  if (isLoading || !data) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading retention-lift proof…</div>;
  }

  const { worked, untouched, liftPoints, quarantined } = data;
  const smallSample = worked.resolved < 20;
  const selectionBias =
    worked.avgRateChange != null && untouched.avgRateChange != null &&
    worked.avgRateChange < untouched.avgRateChange - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--qs-text)' }}>Retention lift — worked vs. untouched</div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 4, maxWidth: 760 }}>
          The honest cohort comparison: of the renewals that reached an outcome, how the ones the desk
          actually called compare to the ones it never got to. Easy-pay auto-resolved renewals are
          excluded — they renewed without a human, so they can't count as saves.
        </div>
      </div>

      {/* Headline lift */}
      <div style={{ borderRadius: 12, padding: 18, border: '1px solid #10B98155', background: '#10B98111',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 600 }}>Retention lift on worked renewals</div>
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 4 }}>
            Worked renewals retained <strong style={{ color: '#10B981' }}>{fmtPct(worked.retainRate)}</strong> vs.{' '}
            <strong style={{ color: 'var(--qs-text)' }}>{fmtPct(untouched.retainRate)}</strong> for the ones never called.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#10B981', lineHeight: 1 }}>
            {liftPoints == null ? '—' : `${liftPoints >= 0 ? '+' : ''}${Math.round(liftPoints)} pts`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-muted)' }}>worked − untouched retain rate</div>
        </div>
      </div>

      {/* Cohorts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <CohortCard title="✅ Worked (≥1 real call)" c={worked} accent="#10B981" highlight />
        <CohortCard title="◻️ Untouched (never called)" c={untouched} accent="#6B7280" />
      </div>

      {/* Quarantine note */}
      <div className="card" style={{ borderLeft: '3px solid #F59E0B' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
          {quarantined.cases.toLocaleString()} auto-resolved renewals ({fmt$(quarantined.premium)}) excluded
        </div>
        <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
          These cleared on the easy-pay heuristic without a logged call — renewals we <em>inferred</em>, not
          worked. Counting them as saves is exactly the overstatement a carrier would catch, so they sit
          outside the comparison above.
        </div>
      </div>

      {/* Honesty caveats — what keeps this defensible */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10 }}>Read this before you quote the number</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--qs-dim)', lineHeight: 1.7 }}>
          {smallSample && (
            <li><strong style={{ color: '#F59E0B' }}>Small sample.</strong> Only {worked.resolved} worked
              renewals have resolved — directional, not yet statistically settled. The gap firms up as volume grows.</li>
          )}
          {selectionBias && (
            <li><strong style={{ color: '#F59E0B' }}>Selection bias.</strong> The worked cohort faced a smaller
              average increase ({fmtRate(worked.avgRateChange)} vs {fmtRate(untouched.avgRateChange)}) — easier saves,
              so some of the lift is which cases got called, not the call itself.</li>
          )}
          <li><strong>No control group.</strong> One agency, no randomized hold-out — this is a within-book
            comparison, not a controlled trial. It shows correlation strongly; it doesn't prove causation alone.</li>
          <li><strong>Tactic capture is {capture?.captureRate == null ? 'still ramping' : `${fmtPct(capture.captureRate)}`}.</strong>{' '}
            {capture && capture.total > 0
              ? <>Only {capture.withTactic} of {capture.total} reached calls recorded what was offered, so we can say worked
                cases retain better — but not yet <em>which</em> tactic did it. That answer fills in as capture climbs.</>
              : <>Until reached calls record the save tactic, we can show the lift but not which tactic drove it.</>}
          </li>
        </ul>
      </div>

      {/* When is the next proof artifact buildable? */}
      <ProofReadiness agencyId={agencyId} capture={capture} />

      <p style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
        "Worked" = at least one genuine (non-auto-logged) attempt on the renewal. Premium retained sums the
        continuing premium on confirmed renewals. Numbers update live from the book.
      </p>
    </div>
  );
}
