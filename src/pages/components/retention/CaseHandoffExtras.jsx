// Case hand-off extras shared by the renewal + cancel detail work surfaces:
//   • EscalateCaseBox  — raise/show an escalation to a licensed agent/principal
//   • LinkedServiceTasks — the service requests raised off this case (two-way link)
//   • ReferToSalesBox  — hand a cross-sell opportunity to the sales board
// All three reuse the modals' dark-theme form classes (dark-label/input/select).

import { useState } from 'react';
import { useCaseEscalation, useEscalateCase } from '../../../hooks/useEscalations';
import { useCaseServiceTasks, TASK_TYPE_MAP } from '../../../hooks/useServiceTasks';
import { useReferCrossSell } from '../../../hooks/useCrossSell';
import { productLabel } from '../../../lib/productLabels';

const ESCALATION_REASONS = [
  'Needs principal approval',
  'Pricing / coverage decision',
  'Retention exception (waive fee / discount)',
  'Complex policy change',
  'Customer dispute / complaint',
  'Other',
];

const REFER_PRODUCTS = ['AUTO', 'HOME', 'LIFE', 'UMBRELLA', 'RENTERS', 'CONDO', 'POWERSPORTS', 'FLOOD', 'BOAT'];

function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Escalation ──────────────────────────────────────────────────────────────
export function EscalateCaseBox({ caseType, caseId, onEscalated }) {
  const { data: open } = useCaseEscalation(caseType, caseId);
  const escalate = useEscalateCase();
  const [openForm, setOpenForm] = useState(false);
  const [reason, setReason] = useState(ESCALATION_REASONS[0]);
  const [note, setNote] = useState('');

  // Already escalated — show the standing hand-off, don't offer to do it again.
  if (open) {
    return (
      <div style={{
        border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
        borderRadius: 10, padding: '12px 14px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>
          ⤴ Escalated to agent — awaiting pickup
        </div>
        <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>
          {open.reason || 'Needs a licensed agent'}
          {open.note ? ` — ${open.note}` : ''}
          {open.created_at ? ` · ${fmtWhen(open.created_at)}` : ''}
        </div>
      </div>
    );
  }

  if (!openForm) {
    return (
      <button type="button" onClick={() => setOpenForm(true)} style={{
        width: '100%', padding: '8px 12px', borderRadius: 8,
        border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)',
        color: '#F87171', fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>
        ⤴ Escalate to agent
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: 14,
      background: 'rgba(239,68,68,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>Escalate to agent</span>
        <button type="button" onClick={() => setOpenForm(false)}
          style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="dark-label">Why does this need an agent?</label>
        <select className="dark-select" value={reason} onChange={e => setReason(e.target.value)}>
          {ESCALATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="dark-label">Details for the agent</label>
        <textarea className="dark-input" rows={2} value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What you've tried, what the customer needs, any deadline." />
      </div>
      <button type="button" disabled={escalate.isPending}
        onClick={() => escalate.mutate(
          { caseType, caseId, reason, note: note.trim() || null },
          { onSuccess: () => { setOpenForm(false); onEscalated?.(); } }
        )}
        style={{
          width: '100%', padding: '9px', borderRadius: 8, border: 'none',
          background: escalate.isPending ? 'var(--qs-card)' : '#EF4444',
          color: escalate.isPending ? 'var(--qs-muted)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: escalate.isPending ? 'not-allowed' : 'pointer',
        }}>
        {escalate.isPending ? 'Escalating…' : 'Hand off to agent'}
      </button>
      {escalate.isError && (
        <div style={{ fontSize: 12, color: '#F87171', marginTop: 6 }}>
          Couldn't escalate — {escalate.error?.message || 'try again'}.
        </div>
      )}
    </div>
  );
}

// ── Linked service tasks (case → tasks) ─────────────────────────────────────
const TASK_STATUS_COLOR = {
  open: '#F59E0B', in_progress: '#3B82F6', blocked: '#EF4444',
  done: '#10B981', cancelled: 'var(--qs-muted)',
};

export function LinkedServiceTasks({ caseType, caseId }) {
  const { data: tasks = [] } = useCaseServiceTasks(caseType, caseId);
  if (tasks.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--qs-border)', borderRadius: 10, padding: '10px 12px',
      background: 'var(--qs-elevated)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        🗂️ Service requests from this case ({tasks.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map(t => {
          const meta = TASK_TYPE_MAP[t.task_type];
          const done = t.status === 'done' || !!t.completed_at;
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span>{meta?.icon || '📌'}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--qs-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.7 : 1 }}>
                {t.title}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                color: TASK_STATUS_COLOR[t.status] || 'var(--qs-muted)',
                background: 'var(--qs-card)', whiteSpace: 'nowrap' }}>
                {t.resolved_on_call ? 'ON CALL' : (t.status || 'open').replace('_', ' ').toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Refer to sales (cross-sell hand-off) ────────────────────────────────────
export function ReferToSalesBox({ agencyId, caseType, caseId, customerName, policyNo, currentProduct }) {
  const refer = useReferCrossSell(agencyId);
  const [openForm, setOpenForm] = useState(false);
  const [product, setProduct] = useState(REFER_PRODUCTS[0]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div style={{ fontSize: 13, color: '#34D399', fontWeight: 600, padding: '8px 12px',
        border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8, background: 'rgba(52,211,153,0.06)' }}>
        ✓ Referred to sales — on the Cross-Sell board
      </div>
    );
  }

  if (!openForm) {
    return (
      <button type="button" onClick={() => setOpenForm(true)} style={{
        width: '100%', padding: '8px 12px', borderRadius: 8,
        border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
        color: 'var(--qs-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>
        💡 Refer to sales (cross-sell)
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderRadius: 10, padding: 14,
      background: 'var(--qs-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)' }}>Refer cross-sell to sales</span>
        <button type="button" onClick={() => setOpenForm(false)}
          style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="dark-label">Product they're interested in</label>
        <select className="dark-select" value={product} onChange={e => setProduct(e.target.value)}>
          {REFER_PRODUCTS.map(p => <option key={p} value={p}>{productLabel(p)}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label className="dark-label">Note for sales</label>
        <textarea className="dark-input" rows={2} value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What they said — e.g. asked about bundling their auto." />
      </div>
      <button type="button" disabled={refer.isPending}
        onClick={() => refer.mutate(
          {
            caseType, caseId, customerName, policyNo,
            currentProduct: currentProduct ? productLabel(currentProduct) : null,
            recommendedProduct: product, notes: note.trim() || null,
          },
          { onSuccess: () => setDone(true) }
        )}
        style={{
          width: '100%', padding: '9px', borderRadius: 8, border: 'none',
          background: refer.isPending ? 'var(--qs-card)' : '#8B5CF6',
          color: refer.isPending ? 'var(--qs-muted)' : '#fff',
          fontSize: 13, fontWeight: 700, cursor: refer.isPending ? 'not-allowed' : 'pointer',
        }}>
        {refer.isPending ? 'Referring…' : 'Send to sales board'}
      </button>
      {refer.isError && (
        <div style={{ fontSize: 12, color: '#F87171', marginTop: 6 }}>
          Couldn't refer — {refer.error?.message || 'try again'}.
        </div>
      )}
    </div>
  );
}
