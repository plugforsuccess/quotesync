// EscalationsInbox — the principal's hand-off destination. Every open escalation
// a rep raised on a renewal/cancel they couldn't close themselves lands here:
// who escalated, why, the customer, and a one-click open of the case + resolve.
// Rendered on the Retention Hub for principals only (resolve is principal-gated).

import { useState } from 'react';
import { useOpenEscalations, useResolveEscalation } from '../../../hooks/useEscalations';
import { titleCaseName } from '../../../lib/names';

const TYPE_BADGE = {
  cancel:  { label: 'CANCEL',  bg: '#EF444422', color: '#F87171' },
  renewal: { label: 'RENEWAL', bg: '#3B82F622', color: '#60A5FA' },
};

function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Row({ esc, empName, onOpenCase, onResolve, resolving }) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState('');
  const badge = TYPE_BADGE[esc.case_type] || TYPE_BADGE.renewal;

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderRadius: 10, padding: '12px 14px',
      background: 'var(--qs-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: badge.bg, color: badge.color, letterSpacing: '0.05em' }}>{badge.label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)' }}>
          {titleCaseName(esc.customer_name) || '—'}
        </span>
        {esc.policy_no && (
          <span style={{ fontSize: 11, color: 'var(--qs-muted)', fontFamily: "'DM Mono', monospace" }}>
            {esc.policy_no}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--qs-muted)' }}>
          {empName ? `${empName} · ` : ''}{fmtWhen(esc.created_at)}
        </span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--qs-text)', marginTop: 6, fontWeight: 600 }}>
        {esc.reason || 'Needs a licensed agent'}
      </div>
      {esc.note && (
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 3 }}>{esc.note}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onOpenCase(esc.case_type, esc.case_id)}
          style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--qs-border)',
            background: 'var(--qs-elevated)', color: 'var(--qs-text)', fontSize: 12,
            fontWeight: 600, cursor: 'pointer' }}>
          Open case →
        </button>
        {!resolveOpen ? (
          <button type="button" onClick={() => setResolveOpen(true)}
            style={{ padding: '6px 12px', borderRadius: 7, border: 'none',
              background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ✓ Resolve
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 220 }}>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="How it was resolved (optional)"
              style={{ flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 12,
                background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }} />
            <button type="button" disabled={resolving}
              onClick={() => onResolve(esc.id, note)}
              style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: '#10B981',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: resolving ? 'not-allowed' : 'pointer' }}>
              {resolving ? '…' : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EscalationsInbox({ agencyId, producers = [], onOpenCase }) {
  const { data: escalations = [] } = useOpenEscalations(agencyId);
  const resolve = useResolveEscalation(agencyId);
  const [resolvingId, setResolvingId] = useState(null);

  if (escalations.length === 0) return null;

  const nameFor = (empId) => {
    const e = producers.find(p => p.id === empId);
    return e ? (e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()) : null;
  };

  function handleResolve(id, note) {
    setResolvingId(id);
    resolve.mutate({ id, note }, { onSettled: () => setResolvingId(null) });
  }

  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: 16,
      marginBottom: 24, background: 'rgba(239,68,68,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>⤴</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F87171', margin: 0 }}>
          Escalations to you ({escalations.length})
        </h3>
        <span style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
          cases a rep handed off for an agent decision
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {escalations.map(esc => (
          <Row key={esc.id} esc={esc} empName={nameFor(esc.escalated_by_id)}
            onOpenCase={onOpenCase} onResolve={handleResolve}
            resolving={resolvingId === esc.id} />
        ))}
      </div>
    </div>
  );
}
