// src/pages/components/retention/OfferOutcomesPanel.jsx
// The Offers report — the consumer of offered_premium / competitor_quote that
// the at-call capture feeds. Three reads:
//   1. Acceptance: when we put a number in front of the customer, how often did
//      the case end saved — and how big a concession did winning take?
//   2. The lost-quote table: every quote that failed to save someone, next to
//      the premium that drove them out. The offer side of the elasticity dataset.
//   3. Competitor intel: who the book is being shopped against and by how much
//      they undercut us.

import { useOfferOutcomes } from '../../../hooks/useOfferOutcomes';
import { useInterventionTypes } from '../../../hooks/useInterventionTypes';

function fmt$(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Math.round(Number(n)).toLocaleString()}`;
}
function fmtPct(r) {
  return r == null ? '—' : `${Math.round(r * 100)}%`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function OfferOutcomesPanel({ agencyId }) {
  const { data, isLoading } = useOfferOutcomes(agencyId);
  const { data: itypes = [] } = useInterventionTypes();
  const tacticLabel = (code) => itypes.find((t) => t.code === code)?.display_name || code;

  if (isLoading) {
    return <div style={{ color: 'var(--qs-subtle)', fontSize: 13, padding: 16 }}>Loading offers…</div>;
  }

  const s = data?.summary;
  if (!s || (s.quoted === 0 && s.competitors.length === 0)) {
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13, color: 'var(--qs-subtle)' }}>
        <strong style={{ color: 'var(--qs-bright)' }}>Offers — quotes made on save calls</strong>
        <div style={{ marginTop: 6 }}>
          Nothing captured yet. When a rep tags a re-quote / bundle / competitor-match tactic on a
          reached call and enters the premium they quoted, it lands here — including the quotes on
          calls that end <em>lost</em>, which is the price data no save ever records.
        </div>
      </div>
    );
  }

  const stat = (label, value, sub, color) => (
    <div style={{
      background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: '10px 14px', minWidth: 150, flex: '1 1 150px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--qs-subtle)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--qs-bright)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const th = { textAlign: 'left', padding: '6px 10px', fontSize: 11, color: 'var(--qs-subtle)', fontWeight: 600, whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', fontSize: 12, color: 'var(--qs-text)', whiteSpace: 'nowrap' };

  return (
    <div className="card" style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
        Offers — what we quote to save customers, and what it wins
      </div>
      <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2, marginBottom: 12 }}>
        Quotes captured on reached calls (re-quote, bundle, competitor match), joined to how the case
        ended. The lost rows are prices that failed to save — data no carrier report contains.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {stat('Quotes given', s.quoted, `${s.open} still open`)}
        {stat('Accepted when resolved', fmtPct(s.acceptRate), `${s.accepted} saved · ${s.lost} lost`,
          s.acceptRate != null && s.acceptRate < 0.5 ? '#F59E0B' : undefined)}
        {stat('Quoted but lost', fmt$(s.lostQuotedPremium), 'premium we offered and still lost', s.lost > 0 ? '#EF4444' : undefined)}
        {stat('Winning concession', s.avgConcessionSavedPct == null ? '—' : `${s.avgConcessionSavedPct.toFixed(0)}%`,
          s.avgConcessionLostPct == null ? 'avg discount on saves' : `saves · lost quotes averaged ${s.avgConcessionLostPct.toFixed(0)}%`)}
      </div>

      {/* Per-tactic offer performance */}
      {s.tactics.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 6 }}>
            By tactic
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.tactics.map((t) => (
              <div key={t.code} style={{
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 160,
              }}>
                <div style={{ color: 'var(--qs-subtle)' }}>{tacticLabel(t.code)}</div>
                <div style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>
                  {t.quoted} quoted · {fmtPct(t.acceptRate)} accepted
                </div>
                {t.avgConcessionPct != null && (
                  <div style={{ color: 'var(--qs-dim)' }}>avg {t.avgConcessionPct.toFixed(0)}% off the table price</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitor intel */}
      {s.competitors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 6 }}>
            Who we're being shopped against
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.competitors.map((c) => (
              <div key={c.name} style={{
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 160,
              }}>
                <div style={{ color: 'var(--qs-bright)', fontWeight: 600 }}>{c.name}</div>
                <div style={{ color: 'var(--qs-dim)' }}>
                  {c.quotes} quote{c.quotes === 1 ? '' : 's'}
                  {c.avgGap != null && (
                    <> · {c.avgGap < 0 ? 'undercuts us ' : 'above us '}{fmt$(Math.abs(c.avgGap))} avg</>
                  )}
                </div>
                <div style={{ color: 'var(--qs-dim)' }}>{c.saved} held · {c.lost} lost</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The crown rows: quotes that didn't save them */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 6 }}>
          Quotes that didn't save them
        </div>
        {s.lostRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>
            None yet — every captured quote so far ended saved or is still open.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--qs-border)' }}>
                  <th style={th}>Customer</th>
                  <th style={th}>Policy</th>
                  <th style={th}>On the table</th>
                  <th style={th}>We quoted</th>
                  <th style={th}>Competitor</th>
                  <th style={th}>Tactic</th>
                  <th style={th}>Rep</th>
                  <th style={th}>Call</th>
                </tr>
              </thead>
              <tbody>
                {s.lostRows.map((r) => (
                  <tr key={r.attempt_id} style={{ borderBottom: '1px solid var(--qs-border)' }}>
                    <td style={td}>{r.customer_name || '—'}</td>
                    <td style={{ ...td, color: 'var(--qs-dim)' }}>{r.policy_no}</td>
                    <td style={td}>
                      {fmt$(r.case_premium)}
                      {r.premium_change_pct != null && (
                        <span style={{ color: '#F59E0B' }}> ({r.premium_change_pct > 0 ? '+' : ''}{Math.round(r.premium_change_pct)}%)</span>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{fmt$(r.offered_premium)}</td>
                    <td style={td}>
                      {r.competitor_quote != null
                        ? <>{fmt$(r.competitor_quote)}{r.competitor_name ? ` (${r.competitor_name})` : ''}</>
                        : (r.competitor_name || '—')}
                    </td>
                    <td style={{ ...td, color: 'var(--qs-dim)' }}>
                      {(r.interventions || []).map(tacticLabel).join(', ') || '—'}
                    </td>
                    <td style={{ ...td, color: 'var(--qs-dim)' }}>{r.rep_name || '—'}</td>
                    <td style={{ ...td, color: 'var(--qs-dim)' }}>{fmtDate(r.attempted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
