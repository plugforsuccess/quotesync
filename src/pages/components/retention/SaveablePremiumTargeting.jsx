// src/pages/components/retention/SaveablePremiumTargeting.jsx
// The brain's payoff, made visible: active renewals ranked by expected saveable
// premium. Answers "work these first — that's where a call actually saves money."
// Churn is grounded in the observed retention from the Premium & Profitability
// report; save-lift is a prior until intervention→outcome data refines it.

import { T } from '../../../components/SiteCopy';
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
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export default function SaveablePremiumTargeting({ agencyId }) {
  const { isLoading, error, ranked, totalSaveable, observed, saveLift, saveLiftObserved, asOfMonth } =
    useRetentionElasticity(agencyId);
  const { tactics } = useInterventionEffectiveness(agencyId);

  if (isLoading) return <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.saveablepremiumtargeting.85a203">Computing saveable premium…</T></div>;
  if (error) return <div style={{ color: '#EF4444', fontSize: 13 }}>{error.message}</div>;

  const top = ranked.slice(0, 25);

  return (
    <div>
      {/* Basis banner */}
      <div style={{
        fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 16,
        background: 'var(--qs-elevated)', borderRadius: 8, padding: '10px 14px',
      }}>
        <T k="pages.components.retention.saveablepremiumtargeting.b5f878">Ranked by</T> <strong><T k="pages.components.retention.saveablepremiumtargeting.f04814">expected saveable premium</T></strong> <T k="pages.components.retention.saveablepremiumtargeting.7affa2">= annual premium × churn risk × save rate.</T>{' '}
        {observed ? (
          <><T k="pages.components.retention.saveablepremiumtargeting.8374a4">Churn risk uses your</T> <strong><T k="pages.components.retention.saveablepremiumtargeting.8bce1b">observed retention</T></strong>{asOfMonth ? ` (as of ${fmtMonth(asOfMonth)})` : ''} <T k="pages.components.retention.saveablepremiumtargeting.741f7c">by product & tenure.</T></>
        ) : (
          <><T k="pages.components.retention.saveablepremiumtargeting.329327">Churn risk is using</T> <strong><T k="pages.components.retention.saveablepremiumtargeting.e6f51c">default priors</T></strong> <T k="pages.components.retention.saveablepremiumtargeting.b904f1">— upload the Premium & Profitability report to ground it in your real retention.</T></>
        )}{' '}
        <T k="pages.components.retention.saveablepremiumtargeting.0e1bf2">Save rate is</T> {saveLiftObserved
          ? <><strong>{Math.round(saveLift * 100)}%</strong> <T k="pages.components.retention.saveablepremiumtargeting.5935ed">— learned from your captured interventions.</T></>
          : <>a <strong>{Math.round(saveLift * 100)}<T k="pages.components.retention.saveablepremiumtargeting.32e68e">% prior</T></strong> <T k="pages.components.retention.saveablepremiumtargeting.47bf2a">until enough interventions are captured to learn it.</T></>}
      </div>

      {/* What's working — per-tactic save rate (the moat dataset) */}
      {tactics.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 10 }}>
            <T k="pages.components.retention.saveablepremiumtargeting.c2b7bf">What's working — save rate by tactic</T>
          </div>
          <div className="scroll-hint-container" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th><T k="pages.components.retention.saveablepremiumtargeting.a5a3f4">Tactic</T></th>
                  <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.d6eb43">Save Rate</T></th>
                  <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.8d9673">Saved / Resolved</T></th>
                  <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.019d1c">Used</T></th>
                </tr>
              </thead>
              <tbody>
                {tactics.map((t) => (
                  <tr key={t.tactic}>
                    <td>{t.label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: t.sufficient ? '#10B981' : 'var(--qs-dim)' }}>
                      {t.saveRate == null ? '—' : `${Math.round(t.saveRate * 100)}%`}
                      {!t.sufficient && <span style={{ fontSize: 10, color: 'var(--qs-subtle)' }}> <T k="pages.components.retention.saveablepremiumtargeting.c06848">(low n)</T></span>}
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
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}><T k="pages.components.retention.saveablepremiumtargeting.7428e1">Saveable premium in queue</T></div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10B981' }}>{money(totalSaveable)}</div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>{ranked.length} <T k="pages.components.retention.saveablepremiumtargeting.af6f34">active renewals</T></div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginBottom: 6 }}><T k="pages.components.retention.saveablepremiumtargeting.31bb85">Top 25 carry</T></div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {totalSaveable > 0 ? Math.round((top.reduce((s, c) => s + c.saveable, 0) / totalSaveable) * 100) : 0}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}><T k="pages.components.retention.saveablepremiumtargeting.4fe10e">of the saveable dollars — start here</T></div>
        </div>
      </div>

      {/* Ranked list */}
      {ranked.length === 0 ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 13 }}><T k="pages.components.retention.saveablepremiumtargeting.e36905">No active renewals to rank.</T></div>
      ) : (
        <div className="scroll-hint-container" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th><T k="pages.components.retention.saveablepremiumtargeting.ce2660">Customer</T></th>
                <th><T k="pages.components.retention.saveablepremiumtargeting.deb105">Product</T></th>
                <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.8d5e7e">Premium</T></th>
                <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.36996f">Rate Δ</T></th>
                <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.0d970d">Churn Risk</T></th>
                <th style={{ textAlign: 'right' }}><T k="pages.components.retention.saveablepremiumtargeting.490ef5">Saveable</T></th>
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
                    <Link to={`/agency/renewals/${c.id}`} style={{ fontSize: 12, color: 'var(--qs-info, #3B82F6)', textDecoration: 'none' }}><T k="pages.components.retention.saveablepremiumtargeting.a96b08">Open →</T></Link>
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
