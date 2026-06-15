// Service Batch — the Operating Playbook's "Afternoon — SERVICE BATCH" surface.
// Routine admin work (mortgagee, vehicles, billing, premium, coverage, docs)
// logged as service_tasks, grouped by type and sorted by due date so it clears
// in one protected block instead of as phone interrupts.

import { useState, useMemo } from 'react';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import {
  useServiceTasks, useCreateServiceTask, useUpdateServiceTask,
  TASK_TYPES, TASK_TYPE_MAP, LANES,
} from '../hooks/useServiceTasks';

const PRIORITY_BADGE = {
  urgent: { label: 'URGENT', bg: '#EF444433', color: '#FCA5A5' },
  high:   { label: 'HIGH',   bg: '#F59E0B33', color: '#FCD34D' },
  normal: null,
  low:    { label: 'LOW',    bg: '#33415533', color: '#94A3B8' },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return { text: 'no due date', color: 'var(--qs-muted)' };
  if (d < 0)  return { text: `${Math.abs(d)}d overdue`, color: '#F87171' };
  if (d === 0) return { text: 'due today', color: '#FCD34D' };
  if (d === 1) return { text: 'due tomorrow', color: 'var(--qs-dim)' };
  return { text: `due in ${d}d`, color: 'var(--qs-muted)' };
}

export default function ServiceBatchPage() {
  const { data: employee } = useCurrentEmployee();
  const agencyId = employee?.org_id;
  const employeeId = employee?.id;

  const { groups, tasks, overdue, isLoading } = useServiceTasks(agencyId);
  const createTask = useCreateServiceTask();
  const updateTask = useUpdateServiceTask();

  const [showAdd, setShowAdd] = useState(false);

  const laneCounts = useMemo(() => {
    const c = { licensed: 0, portal: 0, clerical: 0 };
    for (const t of tasks) {
      const lane = TASK_TYPE_MAP[t.task_type]?.lane;
      if (lane) c[lane] += 1;
    }
    return c;
  }, [tasks]);

  function markDone(id) {
    updateTask.mutate({ id, updates: { status: 'done', completed_by_id: employeeId } });
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

      {/* Lane summary — the work-order for the block */}
      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
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
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <div style={{
          background: '#EF444411', border: '1px solid #EF444433', borderRadius: 10,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#FCA5A5', fontWeight: 600,
        }}>
          ⚠ {overdue} {overdue === 1 ? 'task is' : 'tasks are'} past due — work these first.
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
            No open admin tasks. Log one with “+ Log task” as calls come in.
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
                {group.lane === 'licensed' && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: '#8B5CF622', color: '#C4B5FD', letterSpacing: '0.05em' }}>LICENSED</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task} onDone={() => markDone(task.id)} onClaim={() => claim(task.id)} />
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
  const due = dueLabel(task.due_date);
  const prio = PRIORITY_BADGE[task.priority];
  const inProgress = task.status === 'in_progress';

  return (
    <div style={{
      background: inProgress ? 'rgba(59,130,246,0.06)' : 'var(--qs-elevated)',
      border: '1px solid', borderColor: inProgress ? '#3B82F633' : 'var(--qs-border)',
      borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
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
          <span style={{ color: due.color }}>{due.text}</span>
        </div>
        {task.detail && (
          <div style={{ fontSize: 12, color: 'var(--qs-dim)', marginTop: 4 }}>{task.detail}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
        {!inProgress && (
          <button onClick={onClaim} style={btnStyle('var(--qs-card)', 'var(--qs-text)')}>Start</button>
        )}
        <button onClick={onDone} style={btnStyle('#10B981', '#fff')}>Done</button>
      </div>
    </div>
  );
}

function btnStyle(bg, color) {
  return {
    cursor: 'pointer', border: '1px solid var(--qs-border)', background: bg, color,
    borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
  };
}

function AddTaskForm({ agencyId, busy, onSubmit }) {
  const [taskType, setTaskType] = useState('mortgagee');
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [policyNo, setPolicyNo] = useState('');
  const [dueDate, setDueDate] = useState('');
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
      dueDate: dueDate || null,
      priority,
      detail: detail.trim() || null,
    });
    setTitle(''); setCustomerName(''); setPolicyNo(''); setDueDate(''); setDetail('');
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
        <label style={lbl}>Due date
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={input} />
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
