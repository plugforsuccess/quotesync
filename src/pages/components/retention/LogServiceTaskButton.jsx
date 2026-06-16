// LogServiceTaskButton — capture a service request raised during a renewal or
// cancel call. The default is "handled on this call": one-touch resolution
// while the customer is on the phone, recorded (typed + linked to the case) so
// it counts as a reactive inbound absorbed up front rather than a callback.
// A "queue for batch" fallback covers requests that genuinely can't be done
// live (customer must send a document, left a voicemail).

import { useState } from 'react';
import { useCreateServiceTask, TASK_TYPES, PRODUCTS } from '../../../hooks/useServiceTasks';

export default function LogServiceTaskButton({
  agencyId, policyNo, customerName, customerPhone,
  sourceCaseType, sourceCaseId, source = 'renewal_call',
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState('resolved'); // 'resolved' (on call) | 'batch'
  const [taskType, setTaskType] = useState('billing');
  const [product, setProduct] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('normal');

  const create = useCreateServiceTask();
  const canSubmit = !!agencyId && title.trim().length > 0 && !create.isPending;
  const onCall = mode === 'resolved';

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        agencyId,
        taskType,
        product: product || null,
        title: title.trim(),
        customerName: customerName ?? null,
        policyNo: policyNo ?? null,
        customerPhone: customerPhone ?? null,
        priority,
        source,
        sourceCaseType: sourceCaseType ?? null,
        sourceCaseId: sourceCaseId ?? null,
        // On-call: close it immediately, attributed. Batch: leave it open on the
        // 24h SLA timer (no manual due date).
        status: onCall ? 'done' : 'open',
        resolvedOnCall: onCall,
      },
      {
        onSuccess: () => {
          // Stay open on a success screen so the rep can log another request for
          // the same case (e.g. one handled on-call + one queued for batch).
          setDone(true);
          setTitle(''); setPriority('normal'); setProduct('');
        },
      }
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          border: '1px solid var(--qs-border)', background: 'var(--qs-elevated)',
          color: 'var(--qs-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        ➕ Add service request
      </button>
    );
  }

  const input = {
    background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', width: '100%',
  };
  const lbl = {
    display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700,
    color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const tab = (active) => ({
    flex: 1, padding: '7px 8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12, fontWeight: 700, border: '1px solid',
    borderColor: active ? '#10B981' : 'var(--qs-border)',
    background: active ? '#10B98122' : 'var(--qs-card)',
    color: active ? '#34D399' : 'var(--qs-muted)',
  });

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderRadius: 10, padding: 14, background: 'var(--qs-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)' }}>Service request</span>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      {done ? (
        <div>
          <div style={{ fontSize: 13, color: '#10B981', fontWeight: 600, padding: '6px 0' }}>
            {onCall ? '✓ Handled on this call' : '✓ Queued to Service Batch'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" onClick={() => setDone(false)} style={{
              flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--qs-border)',
              background: 'var(--qs-card)', color: 'var(--qs-text)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ➕ Add another
            </button>
            <button type="button" onClick={() => { setOpen(false); setDone(false); }} style={{
              flex: 1, padding: '8px', borderRadius: 8, border: 'none',
              background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Resolve-on-call is the default; batch is the exception. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button type="button" style={tab(mode === 'resolved')} onClick={() => setMode('resolved')}>
              ✓ Handled on this call
            </button>
            <button type="button" style={tab(mode === 'batch')} onClick={() => setMode('batch')}>
              ⏳ Queue for batch
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={lbl}>Type
              <select value={taskType} onChange={e => setTaskType(e.target.value)} style={input}>
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label style={lbl}>Product
              <select value={product} onChange={e => setProduct(e.target.value)} style={input}>
                <option value="">— Line of business —</option>
                {PRODUCTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            {!onCall && (
              <label style={{ ...lbl, gridColumn: '1 / -1' }}>Priority
                <select value={priority} onChange={e => setPriority(e.target.value)} style={input}>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
            )}
            <label style={{ ...lbl, gridColumn: '1 / -1' }}>{onCall ? 'What was handled' : "What's needed"}
              <input value={title} onChange={e => setTitle(e.target.value)} style={input}
                placeholder={onCall ? 'e.g. Updated EFT to new account' : 'e.g. Customer to email new mortgagee letter'} />
            </label>
            {!onCall && (
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--qs-muted)' }}>
                Queued to the Service Batch on a 24-hour timer.
              </div>
            )}
          </div>

          {(customerName || policyNo) && (
            <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 8 }}>
              For {customerName || '—'}{policyNo ? ` · ${policyNo}` : ''}
            </div>
          )}

          <button type="button" onClick={submit} disabled={!canSubmit} style={{
            marginTop: 12, width: '100%', padding: '9px', borderRadius: 8, border: 'none',
            background: canSubmit ? (onCall ? '#10B981' : '#3B82F6') : 'var(--qs-card)',
            color: canSubmit ? '#fff' : 'var(--qs-muted)',
            fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>
            {create.isPending ? 'Saving…' : onCall ? 'Mark handled on call' : 'Queue for batch'}
          </button>
        </>
      )}
    </div>
  );
}
