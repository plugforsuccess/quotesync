// Service Batch — the Operating Playbook's "Afternoon — SERVICE BATCH" surface.
// Cold service requests (the ones not resolved live on a renewal call) logged as
// service_tasks, grouped by type and sorted by due date so they clear in one
// protected block. Each task copies a paste-ready block for Allstate.

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import {
  useServiceTasks, useUpdateServiceTask, useCreateServiceTask,
  useExpectedCallbacks, useLogCallback, slaMsLeft,
  TASK_TYPES, TASK_TYPE_MAP, LANES, LANE_MAP, SCOPES,
} from '../hooks/useServiceTasks';
import CopyButton from '../components/CopyButton';
import { formatTaskForAllstate } from '../lib/allstateClipboard';

// Completing one of these without recording what was done loses the audit trail
// the agency cares about most — so a completion note is required.
const NOTE_REQUIRED_TYPES = new Set(['billing', 'coverage', 'premium']);

const PRIORITY_BADGE = {
  urgent: { label: 'URGENT', bg: '#EF444433', color: '#FCA5A5' },
  high:   { label: 'HIGH',   bg: '#F59E0B33', color: '#FCD34D' },
  normal: null,
  low:    { label: 'LOW',    bg: '#33415533', color: '#94A3B8' },
};

// 24h SLA countdown from creation — the goal is to clear every service task
// within a day, faster when possible.
function slaLabel(createdAt) {
  const ms = slaMsLeft(createdAt);
  if (ms == null) return { text: '—', color: 'var(--qs-muted)' };
  if (ms < 0) return { text: `SLA overdue ${Math.ceil(-ms / 3600000)}h`, color: '#F87171' };
  const hrs = ms / 3600000;
  if (hrs < 1) return { text: `${Math.max(1, Math.ceil(ms / 60000))}m left`, color: '#F87171' };
  if (hrs < 4) return { text: `${Math.floor(hrs)}h left`, color: '#FBBF24' };
  return { text: `${Math.floor(hrs)}h left`, color: 'var(--qs-muted)' };
}

export default function ServiceBatchPage() {
  const { data: employee } = useCurrentEmployee();
  const agencyId = employee?.org_id;
  const employeeId = employee?.id;
  const queryClient = useQueryClient();

  const [scope, setScope] = useState('all');
  const { groups, tasks, overdue, isLoading } = useServiceTasks(agencyId, { scope, employeeId });
  const createTask = useCreateServiceTask();
  const updateTask = useUpdateServiceTask();

  const [showAdd, setShowAdd] = useState(false);

  // Realtime — a task logged by the front desk (or another rep) shows up live
  // while the batch is open, instead of waiting for a refetch.
  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`service-tasks-${agencyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'service_tasks',
        filter: `agency_id=eq.${agencyId}`,
      }, () => queryClient.invalidateQueries({ queryKey: ['service_tasks'] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [agencyId, queryClient]);

  const laneCounts = useMemo(() => {
    const c = { licensed: 0, portal: 0, clerical: 0 };
    for (const t of tasks) {
      const lane = TASK_TYPE_MAP[t.task_type]?.lane;
      if (lane) c[lane] += 1;
    }
    return c;
  }, [tasks]);

  function markDone(id, completionNote) {
    updateTask.mutate({
      id,
      updates: { status: 'done', completed_by_id: employeeId, completion_note: completionNote || null },
    });
  }
  function claim(id) {
    updateTask.mutate({ id, updates: { status: 'in_progress', assigned_to_id: employeeId } });
  }

  if (!employee) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}>Service Batch</h1>
        <div style={{ marginTop: 16, padding: 20, borderRadius: 10, background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)', color: 'var(--qs-dim)', fontSize: 14, maxWidth: 520 }}>
          You don't have a rep workspace set up. Open <strong>Settings → Profile</strong> to start
          receiving cases and service tasks.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--qs-bright)', margin: 0 }}>
            Service Batch
          </h1>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 2 }}>
            Clear admin work in one protected block · grouped by type, sorted by due date
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{
            flexShrink: 0, cursor: 'pointer', border: '1px solid var(--qs-border)',
            background: showAdd ? 'var(--qs-card)' : '#3B82F6', color: showAdd ? 'var(--qs-text)' : '#fff',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          {showAdd ? 'Close' : '+ Log task'}
        </button>
      </div>

      {showAdd && (
        <AddTaskForm
          agencyId={agencyId}
          busy={createTask.isPending}
          onSubmit={(t) => createTask.mutate({ agencyId, ...t }, { onSuccess: () => setShowAdd(false) })}
        />
      )}

      <ExpectedCallbacks agencyId={agencyId} />

      {/* Scope filter — route the licensed lane to the rep it's assigned to */}
      <div style={{ display: 'flex', gap: 6, margin: '14px 0 0' }}>
        {SCOPES.map(s => (
          <button key={s.value} onClick={() => setScope(s.value)} style={{
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            borderRadius: 999, padding: '5px 14px', border: '1px solid',
            borderColor: scope === s.value ? '#3B82F6' : 'var(--qs-border)',
            background: scope === s.value ? '#3B82F6' : 'var(--qs-card)',
            color: scope === s.value ? '#fff' : 'var(--qs-muted)',
          }}>{s.label}</button>
        ))}
      </div>

      {/* Lane summary — the work-order for the block */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
        {LANES.map((lane, i) => (
          <div key={lane.value} title={lane.hint} style={{
            flex: 1, background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {i + 1}. {lane.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: 'var(--qs-bright)', marginTop: 4 }}>
              {laneCounts[lane.value]}
            </div>
            {/* Plain who-does-it line so any employee can tell at a glance */}
            <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700,
              color: lane.licensed ? '#C4B5FD' : '#34D399' }}>
              {lane.licensed ? '🔒 Licensed agent' : '✅ Front desk OK'}
            </div>
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <div style={{
          background: '#EF444411', border: '1px solid #EF444433', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#FCA5A5', fontWeight: 600,
        }}>
          ⚠ {overdue} {overdue === 1 ? 'task is' : 'tasks are'} past the 24h SLA — work these first.
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--qs-subtle)', fontSize: 14 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', background: 'var(--qs-elevated)',
          borderRadius: 10, border: '1px solid var(--qs-border)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--qs-bright)' }}>Service queue is clear</div>
          <div style={{ fontSize: 13, color: 'var(--qs-muted)', marginTop: 6 }}>
            No open admin tasks in this view. Log one with “+ Log task” as calls come in.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(group => (
            <div key={group.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{group.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--qs-bright)' }}>{group.label}</span>
                <span style={{ fontSize: 12, color: 'var(--qs-muted)' }}>· {group.tasks.length}</span>
                {LANE_MAP[group.lane]?.licensed && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: '#8B5CF622', color: '#C4B5FD', letterSpacing: '0.05em' }}>🔒 LICENSED AGENT</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task}
                    onDone={(note) => markDone(task.id, note)} onClaim={() => claim(task.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onDone, onClaim }) {
  const sla = slaLabel(task.created_at);
  const prio = PRIORITY_BADGE[task.priority];
  const inProgress = task.status === 'in_progress';
  const needsNote = NOTE_REQUIRED_TYPES.has(task.task_type);

  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  function handleDone() {
    if (needsNote) { setConfirming(true); return; }
    onDone(null);
  }

  return (
    <div style={{
      background: inProgress ? 'rgba(59,130,246,0.06)' : 'var(--qs-elevated)',
      border: '1px solid', borderColor: inProgress ? '#3B82F633' : 'var(--qs-border)',
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            {prio && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                background: prio.bg, color: prio.color, letterSpacing: '0.05em' }}>{prio.label}</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {task.title}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
            {task.customer_name ? `${task.customer_name} · ` : ''}
            {task.policy_no ? `${task.policy_no} · ` : ''}
            <span style={{ color: sla.color }}>{sla.text}</span>
          </div>
          {task.detail && (
            <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{task.detail}</div>
          )}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
          <CopyButton getText={() => formatTaskForAllstate(task)} title="Copy for Allstate" />
          {!inProgress && (
            <button onClick={onClaim} style={btnStyle('var(--qs-card)', 'var(--qs-text)')}>Start</button>
          )}
          <button onClick={handleDone} style={btnStyle('#10B981', '#fff')}>Done</button>
        </div>
      </div>

      {confirming && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && note.trim()) onDone(note.trim()); }}
            placeholder="What was done? (required for billing/coverage/premium)"
            style={{
              flex: 1, background: 'var(--qs-card)', border: '1px solid var(--qs-border)',
              borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit',
            }}
          />
          <button onClick={() => note.trim() && onDone(note.trim())} disabled={!note.trim()}
            style={btnStyle(note.trim() ? '#10B981' : 'var(--qs-card)', note.trim() ? '#fff' : 'var(--qs-muted)')}>
            Confirm
          </button>
          <button onClick={() => { setConfirming(false); setNote(''); }} style={btnStyle('var(--qs-card)', 'var(--qs-muted)')}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, color) {
  return {
    cursor: 'pointer', border: '1px solid var(--qs-border)', background: bg, color,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  };
}

// Front-desk callback intake. When a rep leaves a voicemail, the customer is
// flagged "awaiting callback"; when they ring the main line, the front desk
// matches them here (name/phone/rep/reason only — no coverage) and routes a
// callback task to the rep with one click.
function ExpectedCallbacks({ agencyId }) {
  const { data: callbacks = [] } = useExpectedCallbacks(agencyId);
  const logCallback = useLogCallback();
  if (!callbacks.length) return null;

  return (
    <div style={{
      marginTop: 16, border: '1px solid #F59E0B33', borderRadius: 10,
      background: '#F59E0B0D', padding: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#FBBF24', marginBottom: 10 }}>
        📞 Expected callbacks · {callbacks.length}
        <span style={{ fontWeight: 400, color: 'var(--qs-muted)', marginLeft: 6 }}>
          customers a rep is waiting to hear back from
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {callbacks.map(cb => (
          <div key={`${cb.case_type}-${cb.case_id}`} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                {cb.customer_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--qs-muted)' }}>
                {cb.customer_phone || 'no phone'} · {cb.reason}
                {cb.rep_name ? ` · ask for ${cb.rep_name}` : ''}
              </div>
            </div>
            {cb.customer_phone && (
              <CopyButton getText={() => cb.customer_phone} label="Phone" style={{ padding: '5px 9px' }} />
            )}
            <button
              onClick={() => logCallback.mutate({ caseType: cb.case_type, caseId: cb.case_id })}
              disabled={logCallback.isPending}
              style={btnStyle('#3B82F6', '#fff')}
            >
              {cb.rep_name ? `Route to ${cb.rep_name.split(' ')[0]}` : 'Log callback'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddTaskForm({ agencyId, busy, onSubmit }) {
  const [taskType, setTaskType] = useState('mortgagee');
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [priority, setPriority] = useState('normal');
  const [detail, setDetail] = useState('');

  const canSubmit = !!agencyId && title.trim().length > 0 && !busy;

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      taskType,
      title: title.trim(),
      customerName: customerName.trim() || null,
      policyNo: policyNo.trim() || null,
      priority,
      detail: detail.trim() || null,
    });
    setTitle(''); setCustomerName(''); setPolicyNo(''); setDetail('');
  }

  const input = {
    background: 'var(--qs-card)', border: '1px solid var(--qs-border)', borderRadius: 8,
    padding: '8px 10px', fontSize: 13, color: 'var(--qs-text)', fontFamily: 'inherit', width: '100%',
  };

  return (
    <div style={{ background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
      borderRadius: 10, padding: 16, marginBottom: 4 }}>
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
            placeholder="e.g. Update mortgagee to ABC Bank" />
        </label>
        <label style={lbl}>Customer
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={input} placeholder="Name" />
        </label>
        <label style={lbl}>Policy #
          <input value={policyNo} onChange={e => setPolicyNo(e.target.value)} style={input} placeholder="Optional" />
        </label>
        <label style={{ ...lbl, gridColumn: '1 / -1' }}>Detail
          <input value={detail} onChange={e => setDetail(e.target.value)} style={input} placeholder="Optional notes" />
        </label>
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={submit} disabled={!canSubmit} style={{
          cursor: canSubmit ? 'pointer' : 'not-allowed', border: 'none',
          background: canSubmit ? '#3B82F6' : 'var(--qs-card)', color: canSubmit ? '#fff' : 'var(--qs-muted)',
          borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}>{busy ? 'Saving…' : 'Add to batch'}</button>
      </div>
    </div>
  );
}

const lbl = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11, fontWeight: 700, color: 'var(--qs-dim)', textTransform: 'uppercase', letterSpacing: '0.04em',
};
