// ServiceTaskDetailModal — open a single service request to see its full detail
// and act on it (mark done, reassign) without going to the Service Batch. Used
// from the household / customer-search surface so an open request is clickable.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useAssignableMembers } from '../hooks/useEmployees';
import {
  useUpdateServiceTask, TASK_TYPE_MAP, productShort, slaMsLeft, SLA_HOURS,
} from '../hooks/useServiceTasks';

const NOTE_REQUIRED = new Set(['billing', 'coverage', 'premium', 'insurance_review']);

function fmtSla(ms) {
  if (ms == null) return null;
  const overdue = ms < 0;
  const h = Math.floor(Math.abs(ms) / 3600000);
  const m = Math.floor((Math.abs(ms) % 3600000) / 60000);
  const t = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { overdue, text: overdue ? `Overdue ${t}` : `${t} left`, color: overdue ? '#F87171' : h < 4 ? '#FBBF24' : '#34D399' };
}

export default function ServiceTaskDetailModal({ taskId, agencyId, onClose, onChanged }) {
  const { data: employee } = useCurrentEmployee();
  const { data: members = [] } = useAssignableMembers(agencyId);
  const update = useUpdateServiceTask();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ['service_task', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase.from('service_tasks').select('*').eq('id', taskId).single();
      if (error) throw error;
      return data;
    },
  });

  const cfg = task ? (TASK_TYPE_MAP[task.task_type] || { label: task.task_type, icon: '📌', color: '#94A3B8' }) : null;
  const done = task && (task.status === 'done' || task.completed_at);
  const sla = task && !done ? fmtSla(slaMsLeft(task.created_at)) : null;
  const needsNote = task && NOTE_REQUIRED.has(task.task_type);
  const policies = task && task.policy_nos && task.policy_nos.length
    ? task.policy_nos : (task && task.policy_no ? [task.policy_no] : []);
  const nameFor = id => { const m = members.find(x => x.id === id); return m ? m.name : null; };

  function markDone() {
    if (needsNote && !note.trim()) { setConfirming(true); return; }
    update.mutate(
      { id: taskId, updates: { status: 'done', completed_at: new Date().toISOString(),
        completed_by_id: employee?.id ?? null, completion_note: note.trim() || null } },
      { onSuccess: () => { onChanged?.(); onClose(); } }
    );
  }
  function reassign(id) {
    update.mutate({ id: taskId, updates: { assigned_to_id: id || null } }, { onSuccess: () => onChanged?.() });
  }

  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return createPortal(
    <div onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 14,
        width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', padding: '20px 22px' }}>

        {isLoading || !task ? (
          <div style={{ color: 'var(--qs-subtle)', fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40`, color: cfg.color }}>{cfg.label}</span>
                {productShort(task.product) && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                    background: '#22D3EE1a', border: '1px solid #22D3EE40', color: '#67E8F9',
                    fontFamily: "'DM Mono', monospace" }}>{productShort(task.product)}</span>
                )}
                {task.requires_license && <span title="Licensed agent required" style={{ fontSize: 12 }}>🔒</span>}
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--qs-muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 4 }}>{task.title}</div>
            {task.customer_name && (
              <div style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 12 }}>
                {task.customer_name}{policies.length ? ` · ${policies.join(' · ')}` : ''}
              </div>
            )}

            {task.detail && (
              <div style={{ fontSize: 13, color: 'var(--qs-text)', background: 'var(--qs-elevated)',
                border: '1px solid var(--qs-border)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                {task.detail}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><div style={lbl}>Status</div><div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                {done ? 'Done' : (task.status || 'open').replace(/_/g, ' ')}</div></div>
              <div><div style={lbl}>Logged</div><div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                {new Date(task.created_at).toLocaleDateString()}</div></div>
              {sla && <div><div style={lbl}>SLA ({SLA_HOURS}h)</div><div style={{ fontSize: 13, fontWeight: 700, color: sla.color }}>{sla.text}</div></div>}
              {done && task.completion_note && (
                <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Completion note</div>
                  <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>{task.completion_note}</div></div>
              )}
            </div>

            {!done && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...lbl, marginBottom: 4 }}>Assigned to</div>
                  <select value={task.assigned_to_id || ''} onChange={e => reassign(e.target.value)}
                    style={{ width: '100%', background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                      borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit' }}>
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                {(confirming || needsNote) && (
                  <input autoFocus value={note} onChange={e => setNote(e.target.value)}
                    placeholder={needsNote ? 'What was done? (required)' : 'Completion note (optional)'}
                    style={{ width: '100%', background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                      borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--qs-text)',
                      fontFamily: 'inherit', marginBottom: 10 }} />
                )}

                <button onClick={markDone} disabled={update.isPending || (needsNote && !note.trim())}
                  style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                    background: (needsNote && !note.trim()) ? 'var(--qs-elevated)' : '#10B981',
                    color: (needsNote && !note.trim()) ? 'var(--qs-muted)' : '#fff',
                    fontSize: 14, fontWeight: 700, cursor: (needsNote && !note.trim()) ? 'not-allowed' : 'pointer' }}>
                  {update.isPending ? 'Saving…' : '✓ Mark done'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
