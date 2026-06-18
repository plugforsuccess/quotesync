// SaveIntegrityPanel — the principal's "are these saves real?" review. Two
// flags: reversed saves (Allstate later showed the policy lapsed) and unverified
// saves (marked saved with no real logged call — only the auto-record). Plus a
// one-click reconcile against the latest termination report.

import { useState } from 'react';
import { useSaveIntegrity, useReconcileFalseSaves } from '../../../hooks/useSaveIntegrity';
import { titleCaseName } from '../../../lib/names';

function fmt$(n) {
  if (!n) return '$0';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
}
function fmtDate(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}

const KIND = {
  reversed:   { label: 'Reversed save', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)' },
  unverified: { label: 'No logged call', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)' },
};

function Row({ r }) {
  const k = KIND[r.kind] || KIND.unverified;
  return (
    <div style={{ border: `1px solid ${k.border}`, background: k.bg, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: 'var(--qs-card)', color: k.color, letterSpacing: '0.05em' }}>{k.label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)' }}>
          {titleCaseName(r.customer_name) || '—'}
        </span>
        {r.policy_no && (
          <span style={{ fontSize: 11, color: 'var(--qs-muted)', fontFamily: "'DM Mono', monospace" }}>{r.policy_no}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--qs-dim)' }}>
          {r.rep_name || 'Unattributed'} · {fmt$(r.premium)} · {fmtDate(r.resolution_date)}
        </span>
      </div>
      {r.detail && <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{r.detail}</div>}
    </div>
  );
}

export default function SaveIntegrityPanel({ agencyId }) {
  const { data: rows = [], isLoading } = useSaveIntegrity(agencyId);
  const reconcile = useReconcileFalseSaves(agencyId);
  const [lastRun, setLastRun] = useState(null);

  const reversed = rows.filter(r => r.kind === 'reversed');
  const unverified = rows.filter(r => r.kind === 'unverified');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)', margin: 0 }}>Save integrity</h3>
            <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 2, maxWidth: 560 }}>
              Saves caught by the Allstate termination report (reversed) or recorded with no real
              call (only the auto-record). Reversed saves no longer count toward the save rate.
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={() => reconcile.mutate(undefined, { onSuccess: (n) => setLastRun(n) })}
              disabled={reconcile.isPending}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--qs-border)',
                background: 'var(--qs-elevated)', color: 'var(--qs-text)', fontSize: 13, fontWeight: 600,
                cursor: reconcile.isPending ? 'not-allowed' : 'pointer' }}>
              {reconcile.isPending ? 'Checking…' : '↻ Reconcile vs Allstate'}
            </button>
            {lastRun != null && (
              <div style={{ fontSize: 11, color: lastRun > 0 ? '#F87171' : 'var(--qs-muted)', marginTop: 4 }}>
                {lastRun > 0 ? `${lastRun} save${lastRun === 1 ? '' : 's'} flagged reversed` : 'No new reversals'}
              </div>
            )}
            {reconcile.isError && (
              <div style={{ fontSize: 11, color: '#F87171', marginTop: 4 }}>
                {reconcile.error?.message || 'Reconcile failed'}
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ color: 'var(--qs-subtle)', fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--qs-bright)' }}>No integrity flags</div>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 4 }}>
            Every recorded save has a logged call and none have been reversed by Allstate.
          </div>
        </div>
      ) : (
        <>
          {reversed.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#F87171', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8 }}>
                Reversed by Allstate ({reversed.length}) — credit clawed back
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reversed.map(r => <Row key={r.case_id} r={r} />)}
              </div>
            </div>
          )}
          {unverified.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8 }}>
                Saved with no logged call ({unverified.length}) — review
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unverified.map(r => <Row key={r.case_id} r={r} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
