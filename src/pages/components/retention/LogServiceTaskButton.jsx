// LogServiceTaskButton — drop a renewal/cancel case's service request straight
// into the Service Batch. A renewal call that surfaces an EFT change, a vehicle
// add, or a mortgagee update becomes a batchable, due-dated task in one click —
// pre-filled with the case's customer/policy.

import { useState } from 'react';
import { useCreateServiceTask, TASK_TYPES } from '../../../hooks/useServiceTasks';

export default function LogServiceTaskButton({ agencyId, policyNo, customerName, customerPhone, source = 'renewal_call' }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [taskType, setTaskType] = useState('billing');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');

  const create = useCreateServiceTask();
  const canSubmit = !!agencyId && title.trim().length > 0 && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        agencyId,
        taskType,
        title: title.trim(),
        customerName: customerName ?? null,
        policyNo: policyNo ?? null,
        customerPhone: customerPhone ?? null,
        dueDate: dueDate || null,
        priority,
        source,
      },
      {
        onSuccess: () => {
          setDone(true);
          setTitle(''); setDueDate(''); setPriority('normal');
          setTimeout(() => { setOpen(false); setDone(false); }, 1400);
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
        🗂️ Log service task
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

  return (
    <div style={{ border: '1px solid var(--qs-border)', borderRadius: 10, padding: 14, background: 'var(--qs-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)' }}>New service task</span>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      {done ? (
        <div style={{ fontSize: 13, color: '#10B981', fontWeight: 600, padding: '6px 0' }}>
          ✓ Added to Service Batch
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={lbl}>Type
              <select value={taskType} onChange={e => setTaskType(e.target.value)} style={input}>
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label style={lbl}>Priority
              <select value={priority} onChange={e => setPriority(e.target.value)} style={input}>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label style={{ ...lbl, gridColumn: '1 / -1' }}>What's needed
              <input value={title} onChange={e => setTitle(e.target.value)} style={input}
                placeholder="e.g. Update EFT to new account" />
            </label>
            <label style={{ ...lbl, gridColumn: '1 / -1' }}>Due date
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={input} />
            </label>
          </div>
          {(customerName || policyNo) && (
            <div style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 8 }}>
              For {customerName || '—'}{policyNo ? ` · ${policyNo}` : ''}
            </div>
          )}
          <button type="button" onClick={submit} disabled={!canSubmit} style={{
            marginTop: 12, width: '100%', padding: '9px', borderRadius: 8, border: 'none',
            background: canSubmit ? '#3B82F6' : 'var(--qs-card)', color: canSubmit ? '#fff' : 'var(--qs-muted)',
            fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>{create.isPending ? 'Saving…' : 'Add to Service Batch'}</button>
        </>
      )}
    </div>
  );
}
