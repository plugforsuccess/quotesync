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
  useServiceTaskAttempts, useLogServiceTaskAttempt,
  TASK_ATTEMPT_METHODS, TASK_ATTEMPT_RESULTS, TASK_ATTEMPT_RESULT_MAP,
} from '../hooks/useServiceTasks';

const NOTE_REQUIRED = new Set(['billing', 'coverage', 'premium', 'insurance_review', 'reinstatement', 'terminate', 'claim', 'payment']);

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
  const { data: attempts = [] } = useServiceTaskAttempts(taskId);
  const logAttempt = useLogServiceTaskAttempt();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [att, setAtt] = useState({ method: 'phone', result: 'left_voicemail', note: '', followUp: '', waiting: false });

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
  const waiting = task && task.status === 'blocked';
  const sla = task && !done && !waiting ? fmtSla(slaMsLeft(task)) : null;
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
  function submitAttempt() {
    if (logAttempt.isPending) return;
    logAttempt.mutate(
      { taskId, agencyId, employeeId: employee?.id ?? null, method: att.method, result: att.result,
        note: att.note, prevCount: task?.attempt_count ?? 0, prevStatus: task?.status, task,
        followUpAt: att.followUp ? new Date(att.followUp).toISOString() : undefined, waiting: att.waiting },
      { onSuccess: () => { setAtt({ method: 'phone', result: 'left_voicemail', note: '', followUp: '', waiting: false }); onChanged?.(); } }
    );
  }

  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--qs-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' };
  const ctrl = { background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

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
              <div><div style={lbl}>Status</div><div style={{ fontSize: 13, color: waiting ? '#FBBF24' : 'var(--qs-text)' }}>
                {done ? 'Done' : waiting ? '⏸️ Waiting on customer' : (task.status || 'open').replace(/_/g, ' ')}</div></div>
              <div><div style={lbl}>Logged</div><div style={{ fontSize: 13, color: 'var(--qs-text)' }}>
                {new Date(task.created_at).toLocaleDateString()}</div></div>
              {sla && <div><div style={lbl}>SLA ({SLA_HOURS}h)</div><div style={{ fontSize: 13, fontWeight: 700, color: sla.color }}>{sla.text}</div></div>}
              {waiting && <div><div style={lbl}>SLA</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-muted)' }}>Paused</div></div>}
              {!done && task.follow_up_at && (
                <div><div style={lbl}>Follow up</div><div style={{ fontSize: 13, fontWeight: 700,
                  color: new Date(task.follow_up_at) <= new Date() ? '#FBBF24' : 'var(--qs-text)' }}>
                  {new Date(task.follow_up_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div>
              )}
              {done && task.completion_note && (
                <div style={{ gridColumn: '1 / -1' }}><div style={lbl}>Completion note</div>
                  <div style={{ fontSize: 13, color: 'var(--qs-text)' }}>{task.completion_note}</div></div>
              )}
            </div>

            {/* Activity — contact attempts, so the team sees the task is being
                worked (e.g. "left a voicemail at 10am") before it's done. */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...lbl, marginBottom: 8 }}>Activity{attempts.length ? ` · ${attempts.length}` : ''}</div>

              {!done && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: attempts.length ? 12 : 0 }}>
                  <select value={att.method} onChange={e => setAtt(a => ({ ...a, method: e.target.value }))} style={ctrl}>
                    {TASK_ATTEMPT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={att.result} onChange={e => setAtt(a => ({ ...a, result: e.target.value }))} style={ctrl}>
                    {TASK_ATTEMPT_RESULTS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <input value={att.note} onChange={e => setAtt(a => ({ ...a, note: e.target.value }))}
                    placeholder="Note (optional) — e.g. tried cell, left VM"
                    style={{ ...ctrl, gridColumn: '1 / -1' }} />
                  <label style={{ ...lbl, gridColumn: '1 / -1', textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: 'var(--qs-dim)' }}>
                    Next follow-up (optional)
                    <input type="datetime-local" value={att.followUp}
                      onChange={e => setAtt(a => ({ ...a, followUp: e.target.value }))} style={ctrl} />
                  </label>
                  <label style={{ gridColumn: '1 / -1', display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12.5, color: 'var(--qs-dim)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={att.waiting} onChange={e => setAtt(a => ({ ...a, waiting: e.target.checked }))} />
                    Waiting on customer (pauses the 24h SLA)
                  </label>
                  <button type="button" onClick={submitAttempt} disabled={logAttempt.isPending}
                    style={{ gridColumn: '1 / -1', padding: '9px', borderRadius: 8, border: '1px solid var(--qs-border)',
                      background: 'var(--qs-elevated)', color: 'var(--qs-text)', fontSize: 13, fontWeight: 700,
                      cursor: logAttempt.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {logAttempt.isPending ? 'Logging…' : '＋ Log attempt'}
                  </button>
                </div>
              )}

              {attempts.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {attempts.map(a => (
                    <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                      fontSize: 12, background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
                      borderRadius: 8, padding: '7px 10px' }}>
                      <span style={{ color: 'var(--qs-dim)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                        {new Date(a.attempted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--qs-text)' }}>
                        {TASK_ATTEMPT_RESULT_MAP[a.result] || a.result}
                      </span>
                      <span style={{ color: 'var(--qs-muted)' }}>{a.method}</span>
                      {nameFor(a.employee_id) && <span style={{ color: 'var(--qs-subtle)' }}>· {nameFor(a.employee_id)}</span>}
                      {a.note && <span style={{ color: 'var(--qs-muted)', fontStyle: 'italic' }}>“{a.note}”</span>}
                    </div>
                  ))}
                </div>
              )}
              {!done && attempts.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--qs-muted)', marginTop: 8 }}>
                  No attempts logged yet — log a call so the team can see it's being worked.
                </div>
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
