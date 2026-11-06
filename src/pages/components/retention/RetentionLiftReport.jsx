// RetentionLiftReport — the proof screen. Answers the one question that turns a
// call list into a defensible product: do the renewals the desk actually worked
// retain better than the ones it never touched? Built to be honest enough to put
// in front of a carrier — it quarantines inferred (easy-pay) saves, states the
// cohort sizes, and flags selection bias when the worked cohort had an easier
// rate environment. Screenshot-ready.

import { T } from '../../../components/SiteCopy';
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
        <T k="pages.components.retention.retentionliftreport.3d8f8e">renewed ·</T> {c.confirmed}/{c.resolved} <T k="pages.components.retention.retentionliftreport.fafdd4">resolved</T>
      </div>
      <div style={{ height: 1, background: 'var(--qs-border)', margin: '10px 0' }} />
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span><T k="pages.components.retention.retentionliftreport.993124">Premium retained</T></span><strong style={{ color: 'var(--qs-text)' }}>{fmt$(c.premiumRetained)}</strong>
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-dim)', display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span><T k="pages.components.retention.retentionliftreport.b63367">Avg rate increase</T></span><strong style={{ color: 'var(--qs-text)' }}>{fmtRate(c.avgRateChange)}</strong>
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
        letterSpacing: '0.06em', marginBottom: 4 }}><T k="pages.components.retention.retentionliftreport.cb2dce">Build readiness · per-rep tactic save-rate view</T></div>
      <div style={{ fontSize: 13, fontWeight: 800, color: ready ? '#10B981' : 'var(--qs-text)', marginBottom: 10 }}>
        {ready ? <T k="pages.components.retention.retentionliftreport.f394f0">{'Ready to build — the data can support it'}</T> : <T k="pages.components.retention.retentionliftreport.99242f">{'Not yet — keep capturing'}</T>}
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
          ? <T k="pages.components.retention.retentionliftreport.4cb254">{'Both gates are green: the per-rep, per-tactic save-rate grid is worth building now.'}</T>
          : <T k="pages.components.retention.retentionliftreport.c4045e">{'When both rows turn green, the per-rep, per-tactic save-rate grid becomes a small build — this is the number to watch instead of guessing the timing.'}</T>}
      </div>
    </div>
  );
}

export default function RetentionLiftReport({ agencyId }) {
  const { data, isLoading } = useRetentionLift(agencyId);
  const { data: capture } = useTacticCaptureRate(agencyId);

  if (isLoading || !data) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.retentionliftreport.bd2ecc">Loading retention-lift proof…</T></div>;
  }

  const { worked, untouched, liftPoints, quarantined, inboundOnly } = data;
  const smallSample = worked.resolved < 20;
  const selectionBias =
    worked.avgRateChange != null && untouched.avgRateChange != null &&
    worked.avgRateChange < untouched.avgRateChange - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--qs-text)' }}><T k="pages.components.retention.retentionliftreport.094a6b">Retention lift — worked vs. untouched</T></div>
        <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 4, maxWidth: 760 }}>
          <T k="pages.components.retention.retentionliftreport.0745be">The honest cohort comparison: of the renewals that reached an outcome, how the ones the desk proactively called compare to the ones it never got to. Easy-pay auto-resolved renewals and inbound-only renewals (the customer called us) are excluded — neither was driven by the desk's outreach, so they can't count as proactive saves.</T>
        </div>
      </div>

      {/* Headline lift */}
      <div style={{ borderRadius: 12, padding: 18, border: '1px solid #10B98155', background: '#10B98111',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 600 }}><T k="pages.components.retention.retentionliftreport.8987d9">Retention lift on worked renewals</T></div>
          <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginTop: 4 }}>
            <T k="pages.components.retention.retentionliftreport.b1d252">Worked renewals retained</T> <strong style={{ color: '#B07A0E' }}>{fmtPct(worked.retainRate)}</strong> <T k="pages.components.retention.retentionliftreport.84f507">vs.</T>{' '}
            <strong style={{ color: 'var(--qs-text)' }}>{fmtPct(untouched.retainRate)}</strong> <T k="pages.components.retention.retentionliftreport.24e5f6">for the ones never called.</T>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: '#B07A0E', lineHeight: 1 }}>
            {liftPoints == null ? '—' : <>{liftPoints >= 0 ? '+' : ''}{Math.round(liftPoints)}{" "}<T k="pages.components.retention.retentionliftreport.4abdfc">{"pts"}</T></>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-muted)' }}><T k="pages.components.retention.retentionliftreport.74df0e">worked − untouched retain rate</T></div>
        </div>
      </div>

      {/* Cohorts */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <CohortCard title="✅ Worked (≥1 outbound call)" c={worked} accent="#10B981" highlight />
        <CohortCard title="◻️ Untouched (never called)" c={untouched} accent="#6B7280" />
      </div>

      {/* Quarantine note */}
      <div className="card" style={{ borderLeft: '3px solid #F59E0B' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>
          {quarantined.cases.toLocaleString()} <T k="pages.components.retention.retentionliftreport.c20aa3">auto-resolved renewals (</T>{fmt$(quarantined.premium)}<T k="pages.components.retention.retentionliftreport.a2cb6e">) excluded</T>
        </div>
        <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
          <T k="pages.components.retention.retentionliftreport.c50db3">These cleared on the easy-pay heuristic without a logged call — renewals we</T> <em><T k="pages.components.retention.retentionliftreport.723f85">inferred</T></em><T k="pages.components.retention.retentionliftreport.abe271">, not worked. Counting them as saves is exactly the overstatement a carrier would catch, so they sit outside the comparison above.</T>
        </div>
      </div>

      {/* Inbound-only note — only when there are such cases */}
      {inboundOnly && inboundOnly.cases > 0 && (
        <div className="card" style={{ borderLeft: '3px solid #60A5FA' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', marginBottom: 4 }}>
            {inboundOnly.cases.toLocaleString()} <T k="pages.components.retention.retentionliftreport.5b44b6">inbound-only renewals (</T>{fmt$(inboundOnly.premiumRetained)} <T k="pages.components.retention.retentionliftreport.6ea57a">retained) excluded</T>
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-dim)' }}>
            <T k="pages.components.retention.retentionliftreport.63462e">The only logged calls on these were inbound — the</T> <em><T k="pages.components.retention.retentionliftreport.91ec1f">customer</T></em> <T k="pages.components.retention.retentionliftreport.09ed84">reached out. The desk handled them, but it didn't drive the retention, so they're kept out of the proactive worked cohort to avoid crediting outreach we didn't initiate.</T>
          </div>
        </div>
      )}

      {/* Honesty caveats — what keeps this defensible */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 10 }}><T k="pages.components.retention.retentionliftreport.5a9d44">Read this before you quote the number</T></div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--qs-dim)', lineHeight: 1.7 }}>
          {smallSample && (
            <li><strong style={{ color: '#F59E0B' }}><T k="pages.components.retention.retentionliftreport.ca0c88">Small sample.</T></strong> <T k="pages.components.retention.retentionliftreport.839246">Only</T> {worked.resolved} <T k="pages.components.retention.retentionliftreport.955791">worked renewals have resolved — directional, not yet statistically settled. The gap firms up as volume grows.</T></li>
          )}
          {selectionBias && (
            <li><strong style={{ color: '#F59E0B' }}><T k="pages.components.retention.retentionliftreport.b55b22">Selection bias.</T></strong> <T k="pages.components.retention.retentionliftreport.f5d913">The worked cohort faced a smaller average increase (</T>{fmtRate(worked.avgRateChange)} <T k="pages.components.retention.retentionliftreport.f4842d">vs</T> {fmtRate(untouched.avgRateChange)}<T k="pages.components.retention.retentionliftreport.83c815">) — easier saves, so some of the lift is which cases got called, not the call itself.</T></li>
          )}
          <li><strong><T k="pages.components.retention.retentionliftreport.69109a">No control group.</T></strong> <T k="pages.components.retention.retentionliftreport.a69789">One agency, no randomized hold-out — this is a within-book comparison, not a controlled trial. It shows correlation strongly; it doesn't prove causation alone.</T></li>
          <li><strong><T k="pages.components.retention.retentionliftreport.7b4952">Tactic capture is</T> {capture?.captureRate == null ? <T k="pages.components.retention.retentionliftreport.df5bd4">{'still ramping'}</T> : `${fmtPct(capture.captureRate)}`}.</strong>{' '}
            {capture && capture.total > 0
              ? <><T k="pages.components.retention.retentionliftreport.839246">Only</T> {capture.withTactic} <T k="pages.components.retention.retentionliftreport.8bf885">of</T> {capture.total} <T k="pages.components.retention.retentionliftreport.627c85">reached calls recorded what was offered, so we can say worked cases retain better — but not yet</T> <em><T k="pages.components.retention.retentionliftreport.8b7af5">which</T></em> <T k="pages.components.retention.retentionliftreport.e6fdc7">tactic did it. That answer fills in as capture climbs.</T></>
              : <><T k="pages.components.retention.retentionliftreport.505429">Until reached calls record the save tactic, we can show the lift but not which tactic drove it.</T></>}
          </li>
        </ul>
      </div>

      {/* When is the next proof artifact buildable? */}
      <ProofReadiness agencyId={agencyId} capture={capture} />

      <p style={{ fontSize: 11, color: 'var(--qs-muted)' }}>
        <T k="pages.components.retention.retentionliftreport.e482b6">"Worked" = at least one genuine (non-auto-logged) outbound attempt on the renewal. Premium retained sums the continuing premium on confirmed renewals. Numbers update live from the book.</T>
      </p>
    </div>
  );
}
