// src/pages/components/retention/SaveablePremiumTargeting.jsx
// The brain's payoff, made visible: active renewals ranked by expected saveable
// premium. Answers "work these first — that's where a call actually saves money."
// Churn is grounded in the observed retention from the Premium & Profitability
// report; save-lift is a prior until intervention→outcome data refines it.

import { Link } from 'react-router-dom';
import { useRetentionElasticity } from '../../../hooks/useRetentionElasticity';
import { useInterventionEffectiveness } from '../../../hooks/useInterventionEffectiveness';

function money(n) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.round(n).toLocaleString();
}
function fmtMonth(d) {
  if (!d) return null;
  const [y, m] = d.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export default function SaveablePremiumTargeting({ agencyId }) {
  const { isLoading, error, ranked, totalSaveable, observed, saveLift, saveLiftObserved, asOfMonth } =
    useRetentionElasticity(agencyId);
  const { tactics } = useInterventionEffectiveness(agencyId);

  if (isLoading) return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Computing saveable premium…</div>;
  if (error) return <div style={{ color: '#EF4444', fontSize: 13 }}>{error.message}</div>;

  const top = ranked.slice(0, 25);

  return (
    <div>
      {/* Basis banner */}
      <div style={{
        fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 16,
        background: 'var(--qs-elevated)', borderRadius: 8, padding: '10px 14px',
      }}>
        Ranked by <strong>expected saveable premium</strong> = annual premium × churn risk × save rate.{' '}
        {observed ? (
          <>Churn risk uses your <strong>observed retention</strong>{asOfMonth ? ` (as of ${fmtMonth(asOfMonth)})` : ''} by product &amp; tenure.</>
        ) : (
          <>Churn risk is using <strong>default priors</strong> — upload the Premium &amp; Profitability report to ground it in your real retention.</>
        )}{' '}
        Save rate is {saveLiftObserved
          ? <><strong>{Math.round(saveLift * 100)}%</strong> — learned from your captured interventions.</>
          : <>a <strong>{Math.round(saveLift * 100)}% prior</strong> until enough interventions are captured to learn it.</>}
      </div>

      {/* What's working — per-tactic save rate (the moat dataset) */}
      {tactics.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 10 }}>
            What's working — save rate by tactic
          </div>
          <div className="scroll-hint-container" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Tactic</th>
                  <th style={{ textAlign: 'right' }}>Save rate</th>
                  <th style={{ textAlign: 'right' }}>Saved / Resolved</th>
                  <th style={{ textAlign: 'right' }}>Used</th>
                </tr>
              </thead>
              <tbody>
                {tactics.map((t) => (
                  <tr key={t.tactic}>
                    <td>{t.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: t.sufficient ? '#10B981' : 'var(--qs-dim)' }}>
                      {t.saveRate == null ? '—' : `${Math.round(t.saveRate * 100)}%`}
                      {!t.sufficient && <span style={{ fontSize: 10, color: 'var(--qs-subtle)' }}> (low n)</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{t.saved}/{t.resolved}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--qs-dim)' }}>{t.used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Headline */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Saveable premium in queue</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10B981' }}>{money(totalSaveable)}</div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>{ranked.length} active renewals</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}>Top 25 carry</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {totalSaveable > 0 ? Math.round((top.reduce((s, c) => s + c.saveable, 0) / totalSaveable) * 100) : 0}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>of the saveable dollars — start here</div>
        </div>
      </div>

      {/* Ranked list */}
      {ranked.length === 0 ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>No active renewals to rank.</div>
      ) : (
        <div className="scroll-hint-container" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Premium</th>
                <th style={{ textAlign: 'right' }}>Rate Δ</th>
                <th style={{ textAlign: 'right' }}>Churn risk</th>
                <th style={{ textAlign: 'right' }}>Saveable</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => (
                <tr key={c.id} className="triage-row">
                  <td style={{ color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace" }}>{i + 1}</td>
                  <td>
                    {c.customer_name || 'Unknown'}
                    <span style={{ color: 'var(--qs-subtle)', fontFamily: "'DM Mono', monospace", fontSize: 11, marginLeft: 6 }}>{c.policy_no}</span>
                  </td>
                  <td style={{ textTransform: 'uppercase', fontSize: 11, color: 'var(--qs-dim)' }}>{c.product}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{money(c.premium)}</td>
                  <td style={{ textAlign: 'right', color: (c.premium_change_pct || 0) >= 15 ? '#EF4444' : 'var(--qs-text)' }}>
                    {c.premium_change_pct != null ? `${c.premium_change_pct > 0 ? '+' : ''}${Number(c.premium_change_pct).toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--qs-dim)' }}>{Math.round(c.churn * 100)}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#10B981', fontFamily: "'DM Mono', monospace" }}>{money(c.saveable)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link to={`/agency/renewals/${c.id}`} style={{ fontSize: 12, color: 'var(--qs-info, #3B82F6)', textDecoration: 'none' }}>Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
