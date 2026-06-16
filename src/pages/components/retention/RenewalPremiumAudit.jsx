// RenewalPremiumAudit — offer vs paid vs difference for every confirmed renewal
// the rep recorded a paid amount on, plus an agency rollup. Answers "did we renew
// at, above, or below the offer, and by how much."

import { useRenewalPremiumAudit } from '../../../hooks/useRenewalPremiumAudit';
import { titleCaseName } from '../../../lib/names';

function fmt$(n) {
  const v = Math.round(n || 0);
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString()}`;
}
function fmtDate(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}
function diffColor(d) { return d < 0 ? '#34D399' : d > 0 ? '#FBBF24' : 'var(--qs-dim)'; }
function signed(d) { return `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt$(Math.abs(d))}`; }

function Stat({ label, value, sub, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: 'var(--qs-subtle)', fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--qs-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function RenewalPremiumAudit({ agencyId }) {
  const { data, isLoading } = useRenewalPremiumAudit(agencyId);

  if (isLoading) return <div className="card" style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div>;
  if (!data || data.count === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📑</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}>No renewal premiums recorded yet</div>
        <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 4 }}>
          Confirm a renewal and enter the premium paid to populate the audit.
        </div>
      </div>
    );
  }

  const { rows, count, totalOffer, totalPaid, netDiff, avgDiff, below, above, atOffer } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label="Renewals audited" value={count} sub="with a paid amount" />
        <Stat label="Total offered" value={fmt$(totalOffer)} />
        <Stat label="Total paid" value={fmt$(totalPaid)} />
        <Stat label="Net difference" value={signed(netDiff)} color={diffColor(netDiff)}
          sub={`avg ${signed(avgDiff)} / renewal`} />
        <Stat label="vs offer" value={`${below} below · ${atOffer} at · ${above} above`}
          sub="paid relative to the renewal offer" />
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)', margin: '0 0 12px' }}>By renewal</h3>
        <table>
          <thead>
            <tr><th>Customer</th><th>Policy</th><th>Closed</th><th>Rep</th><th>Offer</th><th>Paid</th><th>Difference</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{titleCaseName(r.customer_name) || '—'}</td>
                <td style={{ fontFamily: "'DM Mono', monospace", color: 'var(--qs-muted)' }}>{r.policy_no || '—'}</td>
                <td>{fmtDate(r.resolution_date)}</td>
                <td style={{ color: 'var(--qs-dim)' }}>{r.rep || '—'}</td>
                <td>{fmt$(r.offer)}</td>
                <td>{fmt$(r.paid)}</td>
                <td style={{ fontWeight: 700, color: diffColor(r.diff) }}>
                  {signed(r.diff)}{r.pct ? ` (${r.pct > 0 ? '+' : ''}${r.pct.toFixed(0)}%)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 10 }}>
          Offer is the renewal report premium; paid is what the rep recorded. Difference = paid − offer
          (green = renewed below offer, amber = above).
        </p>
      </div>
    </div>
  );
}
